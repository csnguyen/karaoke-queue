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

// Exported so the TV can work out what a remote command will change before applying it
export function reducer(state, action) {
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

    case 'SET_PAUSED':
      return state.paused === action.paused ? state : { ...state, paused: action.paused }

    // Actions that change nothing return the same state, so callers can tell
    case 'REMOVE_SONG':
      if (!state.queue.some((s) => s.id === action.id)) return state
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

    // Plays one queued song now; the songs ahead of and behind it stay queued in order
    case 'SKIP_TO': {
      const { index } = action
      if (index < 0 || index >= state.queue.length) return state
      return {
        ...state,
        current: state.queue[index],
        queue: state.queue.filter((_, i) => i !== index),
        history: state.current ? [...state.history, state.current] : state.history,
        paused: false,
      }
    }

    // Remote commands from phones refer to songs by request id, since a phone's view of
    // the queue can be a few seconds behind the TV's.
    case 'PLAY_SONG_NOW': {
      const index = state.queue.findIndex((s) => s.id === action.id)
      return index === -1 ? state : reducer(state, { type: 'SKIP_TO', index })
    }

    case 'MOVE_SONG': {
      const from = state.queue.findIndex((s) => s.id === action.id)
      if (from === -1) return state
      const rest = state.queue.filter((_, i) => i !== from)
      let to = 0
      if (action.afterId != null) {
        const anchor = rest.findIndex((s) => s.id === action.afterId)
        if (anchor === -1) return state // anchor already played or gone: leave the order alone
        to = anchor + 1
      }
      if (to === from) return state
      return { ...state, queue: [...rest.slice(0, to), state.queue[from], ...rest.slice(to)] }
    }

    // Only skips if the song the phone saw is still playing, so a "next" that arrives
    // after the song ended on its own doesn't skip the one that followed
    case 'SKIP_IF_CURRENT':
      return (state.current?.id ?? null) === action.currentId ? reducer(state, { type: 'SKIP' }) : state

    case 'MERGE_REMOTE_SONGS': {
      // Each request has its own id, so history is not checked: a song played earlier
      // (even in a previous session) can be requested again. Skipping ids already
      // playing or queued just guards against the same request arriving twice.
      const seen = new Set([
        ...(state.current ? [state.current.id] : []),
        ...state.queue.map((s) => s.id),
      ])
      // "Play Next" requests jump to the front (the latest one first, like ADD_NEXT);
      // everything else joins the end in the order it was requested.
      let queue = state.queue
      for (const { playNext, ...song } of action.songs) {
        if (seen.has(song.id)) continue
        seen.add(song.id)
        queue = playNext ? [song, ...queue] : [...queue, song]
      }
      if (queue === state.queue) return state
      return { ...state, queue }
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
  const setPaused = useCallback((paused) => dispatch({ type: 'SET_PAUSED', paused }), [])
  const playSongNow = useCallback((id) => dispatch({ type: 'PLAY_SONG_NOW', id }), [])
  const moveSong = useCallback((id, afterId) => dispatch({ type: 'MOVE_SONG', id, afterId }), [])
  const skipIfCurrent = useCallback((currentId) => dispatch({ type: 'SKIP_IF_CURRENT', currentId }), [])
  const skipTo = useCallback((index) => dispatch({ type: 'SKIP_TO', index }), [])

  return (
    <QueueContext.Provider value={{ ...state, dispatch, addSong, addNext, skip, skipTo, removeSong, reorder, panicRecover, restore, mergeRemoteSongs, togglePause, setPaused, playSongNow, moveSong, skipIfCurrent }}>
      {children}
    </QueueContext.Provider>
  )
}

export function useQueue() {
  const ctx = useContext(QueueContext)
  if (!ctx) throw new Error('useQueue must be used within QueueProvider')
  return ctx
}
