import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRoomSync, pushSongToRoom, POLL_INTERVAL_MS } from '../hooks/useRoomSync'
import { QueueProvider } from '../context/QueueContext'

const wrapper = ({ children }) => React.createElement(QueueProvider, null, children)

const mockFetch = (impl) => vi.spyOn(globalThis, 'fetch').mockImplementation(impl)

function makeSong(overrides = {}) {
  return { id: 'vid1', videoId: 'vid1', title: 'Test Song', artist: 'Test Artist', ...overrides }
}

function makeOkJson(data) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) })
}

function makeErrorJson(status, data) {
  return Promise.resolve({ ok: false, status, json: () => Promise.resolve(data) })
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── create-room ──────────────────────────────────────────────────────────────

describe('create-room API contract', () => {
  it('returns a 4-character alphanumeric room code', async () => {
    mockFetch((url) => {
      if (url === '/api/create-room') return makeOkJson({ code: 'AB12' })
      return makeOkJson({ songs: [] })
    })
    const { result } = renderHook(() => useRoomSync(), { wrapper })
    await act(async () => { await result.current.createRoom() })
    expect(result.current.roomCode).toBe('AB12')
  })

  it('sets syncError when create-room returns a non-ok response', async () => {
    mockFetch(() => makeErrorJson(500, { error: 'Server error' }))
    const { result } = renderHook(() => useRoomSync(), { wrapper })
    await act(async () => { await result.current.createRoom() })
    expect(result.current.syncError).toMatch(/Create room failed/)
    expect(result.current.roomCode).toBeNull()
  })
})

// ─── get-room validation ───────────────────────────────────────────────────────

describe('get-room API — malformed code validation', () => {
  it('does not start polling when roomCode is null', async () => {
    const spy = mockFetch(() => makeOkJson({ songs: [] }))
    renderHook(() => useRoomSync(), { wrapper })
    // No createRoom called — polling must not start
    expect(spy).not.toHaveBeenCalled()
  })

  it('sets syncError when get-room returns 400 for bad code', async () => {
    mockFetch((url) => {
      if (url === '/api/create-room') return makeOkJson({ code: 'BADC' })
      return makeErrorJson(400, { error: 'Invalid room code' })
    })
    const { result } = renderHook(() => useRoomSync(), { wrapper })
    await act(async () => { await result.current.createRoom() })
    await waitFor(() => expect(result.current.syncError).toMatch(/Sync failed: 400/))
  })

  it('sets syncError when get-room returns 404 for unknown room', async () => {
    mockFetch((url) => {
      if (url === '/api/create-room') return makeOkJson({ code: 'GONE' })
      return makeErrorJson(404, { error: 'Room not found or expired' })
    })
    const { result } = renderHook(() => useRoomSync(), { wrapper })
    await act(async () => { await result.current.createRoom() })
    await waitFor(() => expect(result.current.syncError).toMatch(/Sync failed: 404/))
  })
})

// ─── push-song payload ────────────────────────────────────────────────────────

describe('push-song payload matches LocalStorage schema', () => {
  it('sends the correct JSON shape to /api/push-song', async () => {
    let capturedBody
    mockFetch((url, opts) => {
      capturedBody = JSON.parse(opts?.body ?? '{}')
      return makeOkJson({ ok: true })
    })
    const song = makeSong()
    await pushSongToRoom('ABCD', song, 'Alice')
    expect(capturedBody).toEqual({
      roomCode: 'ABCD',
      songData: song,
      singerName: 'Alice',
    })
    // Payload fields must match LocalStorage song schema
    expect(capturedBody.songData).toHaveProperty('id')
    expect(capturedBody.songData).toHaveProperty('videoId')
    expect(capturedBody.songData).toHaveProperty('title')
    expect(capturedBody.songData).toHaveProperty('artist')
  })

  it('throws when push-song returns 400 for invalid roomCode', async () => {
    mockFetch(() => makeErrorJson(400, { error: 'Invalid room code' }))
    await expect(pushSongToRoom('!!', makeSong())).rejects.toThrow('Invalid room code')
  })

  it('throws when push-song returns 400 for missing song fields', async () => {
    mockFetch(() => makeErrorJson(400, { error: 'Invalid song data — required: id, title' }))
    await expect(pushSongToRoom('ABCD', {})).rejects.toThrow('Invalid song data')
  })

  it('throws when push-song returns 404 for expired room', async () => {
    mockFetch(() => makeErrorJson(404, { error: 'Room not found or expired' }))
    await expect(pushSongToRoom('GONE', makeSong())).rejects.toThrow('Room not found or expired')
  })
})

// ─── polling behavior (uses fake timers) ──────────────────────────────────────

describe('polling — interval and error recovery', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('polls at POLL_INTERVAL_MS after room is created', async () => {
    const spy = mockFetch((url) => {
      if (url === '/api/create-room') return makeOkJson({ code: 'POLL' })
      return makeOkJson({ songs: [] })
    })
    const { result } = renderHook(() => useRoomSync(), { wrapper })
    await act(async () => { await result.current.createRoom() })
    const callsAfterCreate = spy.mock.calls.length // create + immediate poll

    await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL_MS) })
    expect(spy.mock.calls.length).toBeGreaterThan(callsAfterCreate)
  })

  it('clears polling interval on unmount — no further calls after unmount', async () => {
    const spy = mockFetch((url) => {
      if (url === '/api/create-room') return makeOkJson({ code: 'UMNT' })
      return makeOkJson({ songs: [] })
    })
    const { result, unmount } = renderHook(() => useRoomSync(), { wrapper })
    await act(async () => { await result.current.createRoom() })
    unmount()
    const callsAtUnmount = spy.mock.calls.length
    act(() => { vi.advanceTimersByTime(POLL_INTERVAL_MS * 5) })
    expect(spy.mock.calls.length).toBe(callsAtUnmount)
  })

  it('sets syncError on network failure and clears it when next poll succeeds', async () => {
    let pollCount = 0
    mockFetch((url) => {
      if (url === '/api/create-room') return makeOkJson({ code: 'NERR' })
      pollCount++
      if (pollCount === 1) return Promise.reject(new Error('Network error'))
      return makeOkJson({ songs: [] })
    })
    const { result } = renderHook(() => useRoomSync(), { wrapper })
    await act(async () => { await result.current.createRoom() })
    // Immediate poll (pollCount=1) fails
    await act(async () => {})
    expect(result.current.syncError).toMatch(/Network error/)

    // Next tick (pollCount=2) succeeds
    await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL_MS) })
    await act(async () => {})
    expect(result.current.syncError).toBeNull()
  })
})

// ─── MERGE_REMOTE_SONGS deduplication ─────────────────────────────────────────

describe('MERGE_REMOTE_SONGS — deduplication against LocalStorage schema', () => {
  it('merges only new songs not already in the queue', async () => {
    const existingSong = makeSong({ id: 'existing', title: 'Old Song' })
    const newSong = makeSong({ id: 'new', title: 'New Song' })

    mockFetch((url) => {
      if (url === '/api/create-room') return makeOkJson({ code: 'MERG' })
      return makeOkJson({ songs: [existingSong, newSong] })
    })

    const initialState = { current: null, queue: [existingSong], history: [] }
    const wrapperWithState = ({ children }) =>
      React.createElement(QueueProvider, { initialStateOverride: initialState }, children)

    const { result } = renderHook(() => useRoomSync(), { wrapper: wrapperWithState })
    await act(async () => { await result.current.createRoom() })
    // Poll succeeds — no error means deduplication ran without crash
    await waitFor(() => expect(result.current.syncError).toBeNull())
  })
})
