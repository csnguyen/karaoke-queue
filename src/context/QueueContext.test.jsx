import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { QueueProvider, useQueue } from './QueueContext'

const song1 = { id: '1', title: 'Song One', artist: 'Artist A', videoId: 'aaa' }
const song2 = { id: '2', title: 'Song Two', artist: 'Artist B', videoId: 'bbb' }
const song3 = { id: '3', title: 'Song Three', artist: 'Artist C', videoId: 'ccc' }

function TestConsumer({ onRender }) {
  const queue = useQueue()
  onRender(queue)
  return null
}

function setup(initialStateOverride) {
  let ctx
  render(
    <QueueProvider initialStateOverride={initialStateOverride}>
      <TestConsumer onRender={(c) => { ctx = c }} />
    </QueueProvider>
  )
  return () => ctx
}

describe('QueueContext', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('provides initial empty state', () => {
    const getCtx = setup({ current: null, queue: [], history: [] })
    const ctx = getCtx()
    expect(ctx.current).toBeNull()
    expect(ctx.queue).toEqual([])
    expect(ctx.history).toEqual([])
  })

  it('addSong appends song to queue', () => {
    const getCtx = setup({ current: null, queue: [], history: [] })
    act(() => getCtx().addSong(song1))
    expect(getCtx().queue).toEqual([song1])
    act(() => getCtx().addSong(song2))
    expect(getCtx().queue).toEqual([song1, song2])
  })

  it('addNext prepends song to front of queue', () => {
    const getCtx = setup({ current: null, queue: [song2, song3], history: [] })
    act(() => getCtx().addNext(song1))
    expect(getCtx().queue[0]).toEqual(song1)
    expect(getCtx().queue).toHaveLength(3)
  })

  it('skip moves current to history and promotes first queue item', () => {
    const getCtx = setup({ current: song1, queue: [song2, song3], history: [] })
    act(() => getCtx().skip())
    expect(getCtx().current).toEqual(song2)
    expect(getCtx().queue).toEqual([song3])
    expect(getCtx().history).toEqual([song1])
  })

  it('skip with empty queue sets current to null', () => {
    const getCtx = setup({ current: song1, queue: [], history: [] })
    act(() => getCtx().skip())
    expect(getCtx().current).toBeNull()
    expect(getCtx().history).toEqual([song1])
  })

  it('skip with no current song and empty queue stays null', () => {
    const getCtx = setup({ current: null, queue: [], history: [] })
    act(() => getCtx().skip())
    expect(getCtx().current).toBeNull()
    expect(getCtx().history).toEqual([])
  })

  it('removeSong removes song from queue by id', () => {
    const getCtx = setup({ current: null, queue: [song1, song2, song3], history: [] })
    act(() => getCtx().removeSong('2'))
    expect(getCtx().queue).toEqual([song1, song3])
  })

  it('reorder moves song from one index to another', () => {
    const getCtx = setup({ current: null, queue: [song1, song2, song3], history: [] })
    act(() => getCtx().reorder(0, 2))
    expect(getCtx().queue).toEqual([song2, song3, song1])
  })

  it('reorder with same index is a no-op', () => {
    const getCtx = setup({ current: null, queue: [song1, song2, song3], history: [] })
    act(() => getCtx().reorder(1, 1))
    expect(getCtx().queue).toEqual([song1, song2, song3])
  })

  it('persists state to localStorage after each action', () => {
    const getCtx = setup({ current: null, queue: [], history: [] })
    act(() => getCtx().addSong(song1))
    const saved = JSON.parse(localStorage.getItem('karaoke-queue'))
    expect(saved.queue).toEqual([song1])
  })

  it('panicRecover restores state from localStorage', () => {
    const savedState = { current: song2, queue: [song3], history: [song1] }
    const getCtx = setup({ current: null, queue: [], history: [] })
    act(() => {
      localStorage.setItem('karaoke-queue', JSON.stringify(savedState))
      getCtx().panicRecover()
    })
    expect(getCtx().current).toEqual(song2)
    expect(getCtx().queue).toEqual([song3])
    expect(getCtx().history).toEqual([song1])
  })

  it('panicRecover with no localStorage data leaves state unchanged', () => {
    const getCtx = setup({ current: song1, queue: [song2], history: [] })
    localStorage.clear()
    act(() => getCtx().panicRecover())
    expect(getCtx().current).toEqual(song1)
    expect(getCtx().queue).toEqual([song2])
  })

  it('useQueue throws when used outside QueueProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Bad() {
      useQueue()
      return null
    }
    expect(() => render(<Bad />)).toThrow('useQueue must be used within QueueProvider')
    consoleError.mockRestore()
  })

  it('history accumulates across multiple skips', () => {
    const getCtx = setup({ current: song1, queue: [song2, song3], history: [] })
    act(() => getCtx().skip())
    act(() => getCtx().skip())
    expect(getCtx().history).toEqual([song1, song2])
    expect(getCtx().current).toEqual(song3)
    expect(getCtx().queue).toEqual([])
  })
})
