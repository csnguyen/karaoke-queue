import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { QueueProvider, useQueue } from '../context/QueueContext'
import { useMultiDeviceSync } from './useMultiDeviceSync'

const song1 = { id: '1', title: 'Song One', artist: 'Artist A', videoId: 'aaa' }
const song2 = { id: '2', title: 'Song Two', artist: 'Artist B', videoId: 'bbb' }
const song3 = { id: '3', title: 'Song Three', artist: 'Artist C', videoId: 'ccc' }

function SyncConsumer({ onRender }) {
  const ctx = useQueue()
  useMultiDeviceSync()
  onRender(ctx)
  return null
}

function setup(initialState) {
  let ctx
  render(
    <QueueProvider initialStateOverride={initialState}>
      <SyncConsumer onRender={(c) => { ctx = c }} />
    </QueueProvider>
  )
  return () => ctx
}

function fireStorage(key, value) {
  window.dispatchEvent(
    new StorageEvent('storage', {
      key,
      newValue: value === null ? null : JSON.stringify(value),
      storageArea: localStorage,
    })
  )
}

describe('useMultiDeviceSync', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('merges new songs from storage event into the queue', () => {
    const getCtx = setup({ current: null, queue: [], history: [] })

    act(() => {
      fireStorage('karaoke-queue', { current: null, queue: [song1, song2], history: [] })
    })

    expect(getCtx().queue).toContainEqual(song1)
    expect(getCtx().queue).toContainEqual(song2)
  })

  it('does not overwrite TV current when mobile adds a new song', () => {
    // TV is playing song1; mobile adds song2
    const getCtx = setup({ current: song1, queue: [], history: [] })

    act(() => {
      fireStorage('karaoke-queue', { current: null, queue: [song2], history: [] })
    })

    // TV keeps playing song1 — the merge must not reset current
    expect(getCtx().current).toEqual(song1)
    // song2 appears in TV queue
    expect(getCtx().queue).toContainEqual(song2)
  })

  it('does not duplicate songs already in queue or current', () => {
    const getCtx = setup({ current: song1, queue: [song2], history: [] })

    act(() => {
      fireStorage('karaoke-queue', { current: song1, queue: [song2, song3], history: [] })
    })

    // song1 stays as current (not duplicated into queue)
    expect(getCtx().current).toEqual(song1)
    // song2 already in queue — not duplicated
    const song2Count = getCtx().queue.filter((s) => s.id === song2.id).length
    expect(song2Count).toBe(1)
    // song3 is new — added
    expect(getCtx().queue).toContainEqual(song3)
  })

  it('ignores storage events for unrelated keys', () => {
    const getCtx = setup({ current: null, queue: [], history: [] })

    act(() => {
      fireStorage('some-other-key', { current: song1, queue: [], history: [] })
    })

    expect(getCtx().current).toBeNull()
    expect(getCtx().queue).toEqual([])
  })

  it('ignores storage events with null newValue (key cleared)', () => {
    const getCtx = setup({ current: song1, queue: [], history: [] })

    act(() => {
      fireStorage('karaoke-queue', null)
    })

    expect(getCtx().current).toEqual(song1)
  })

  it('ignores storage events with malformed JSON', () => {
    const getCtx = setup({ current: song1, queue: [], history: [] })

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'karaoke-queue',
          newValue: '{invalid-json',
          storageArea: localStorage,
        })
      )
    })

    expect(getCtx().current).toEqual(song1)
  })

  it('removes event listener on unmount', () => {
    const spy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(
      <QueueProvider initialStateOverride={{ current: null, queue: [], history: [] }}>
        <SyncConsumer onRender={() => {}} />
      </QueueProvider>
    )
    unmount()
    expect(spy).toHaveBeenCalledWith('storage', expect.any(Function))
    spy.mockRestore()
  })
})
