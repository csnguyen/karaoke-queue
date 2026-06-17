import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { QueueProvider, useQueue } from '../context/QueueContext'
import { useMultiDeviceSync } from './useMultiDeviceSync'

const song1 = { id: '1', title: 'Song One', artist: 'Artist A', videoId: 'aaa' }
const song2 = { id: '2', title: 'Song Two', artist: 'Artist B', videoId: 'bbb' }

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

  it('restores state when storage event fires for karaoke-queue key', () => {
    const getCtx = setup({ current: null, queue: [], history: [] })
    const newState = { current: song1, queue: [song2], history: [] }

    act(() => {
      fireStorage('karaoke-queue', newState)
    })

    expect(getCtx().current).toEqual(song1)
    expect(getCtx().queue).toEqual([song2])
  })

  it('ignores storage events for unrelated keys', () => {
    const getCtx = setup({ current: null, queue: [], history: [] })

    act(() => {
      fireStorage('some-other-key', { current: song1, queue: [], history: [] })
    })

    expect(getCtx().current).toBeNull()
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

  it('syncs queue updates from another tab', () => {
    const getCtx = setup({ current: song1, queue: [], history: [] })
    const updatedState = { current: song1, queue: [song2], history: [] }

    act(() => {
      fireStorage('karaoke-queue', updatedState)
    })

    expect(getCtx().queue).toEqual([song2])
  })
})
