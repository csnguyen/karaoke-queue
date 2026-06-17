import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'karaoke-queue'

const initialState = {
  current: null,
  queue: [],
  history: [],
  paused: false,
}

function loadFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

function saveToStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage unavailable — silent fail
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'ADD_SONG':
      return { ...state, queue: [...state.queue, action.song] }

    case 'ADD_NEXT':
      return { ...state, queue: [action.song, ...state.queue] }

    case 'SKIP': {
      const next = state.queue[0] ?? null
      const newHistory = state.current
        ? [...state.history, state.current]
        : state.history
      return {
        ...state,
        current: next,
        queue: state.queue.slice(1),
        history: newHistory,
        paused: false,
      }
    }

    case 'TOGGLE_PAUSE':
      return { ...state, paused: !state.paused }

    case 'REMOVE_SONG':
      return { ...state, queue: state.queue.filter((s) => s.id !== action.id) }

    case 'REORDER': {
      const { fromIndex, toIndex } = action
      if (fromIndex === toIndex) return state
      const q = [...state.queue]
      const [moved] = q.splice(fromIndex, 1)
      q.splice(toIndex, 0, moved)
      return { ...state, queue: q }
    }

    case 'PANIC_RECOVER': {
      const saved = loadFromStorage()
      return saved ?? state
    }

    case 'RESTORE':
      return action.state

    case 'SKIP_TO': {
      const { index } = action
      if (index < 0 || index >= state.queue.length) return state
      const target = state.queue[index]
      const skipped = state.queue.slice(0, index)
      const remaining = state.queue.slice(index + 1)
      const newHistory = [
        ...(state.current ? [...state.history, state.current] : state.history),
        ...skipped,
      ]
      return { ...state, current: target, queue: remaining, history: newHistory, paused: false }
    }

    case 'MERGE_REMOTE_SONGS': {
      const seen = new Set([
        ...(state.current ? [state.current.id] : []),
        ...state.queue.map((s) => s.id),
        ...state.history.map((s) => s.id),
      ])
      const incoming = action.songs.filter((s) => !seen.has(s.id))
      if (incoming.length === 0) return state
      return { ...state, queue: [...state.queue, ...incoming] }
    }

    default:
      return state
  }
}

const QueueContext = createContext(null)

export function QueueProvider({ children, initialStateOverride }) {
  const [state, dispatch] = useReducer(
    reducer,
    initialStateOverride ?? loadFromStorage() ?? initialState
  )

  useEffect(() => {
    saveToStorage(state)
  }, [state])

  const addSong = useCallback((song) => dispatch({ type: 'ADD_SONG', song }), [])
  const addNext = useCallback((song) => dispatch({ type: 'ADD_NEXT', song }), [])
  const skip = useCallback(() => dispatch({ type: 'SKIP' }), [])
  const removeSong = useCallback((id) => dispatch({ type: 'REMOVE_SONG', id }), [])
  const reorder = useCallback((fromIndex, toIndex) => dispatch({ type: 'REORDER', fromIndex, toIndex }), [])
  const panicRecover = useCallback(() => dispatch({ type: 'PANIC_RECOVER' }), [])
  const restore = useCallback((s) => dispatch({ type: 'RESTORE', state: s }), [])
  const mergeRemoteSongs = useCallback((songs) => dispatch({ type: 'MERGE_REMOTE_SONGS', songs }), [])
  const togglePause = useCallback(() => dispatch({ type: 'TOGGLE_PAUSE' }), [])
  const skipTo = useCallback((index) => dispatch({ type: 'SKIP_TO', index }), [])

  return (
    <QueueContext.Provider value={{ ...state, addSong, addNext, skip, skipTo, removeSong, reorder, panicRecover, restore, mergeRemoteSongs, togglePause }}>
      {children}
    </QueueContext.Provider>
  )
}

export function useQueue() {
  const ctx = useContext(QueueContext)
  if (!ctx) throw new Error('useQueue must be used within QueueProvider')
  return ctx
}
