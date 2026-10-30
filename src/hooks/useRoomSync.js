import { useState, useEffect, useCallback, useRef } from 'react'
import { useQueue } from '../context/QueueContext'

export const POLL_INTERVAL_MS = 2500
// The TV refreshes its room's expiry this often, so the room lives as long as the TV is open
export const KEEP_ALIVE_MS = 5 * 60 * 1000
// Don't retry re-creating a missing room more often than this
const RECLAIM_RETRY_MS = 30 * 1000

// Polls a room code. The TV (mergeSongs: true) adds newly requested songs to its queue and
// hands new phone commands to onCommands; phones read the TV's current song, queue and
// paused state from the response.
export function useRoomPoll(roomCode, { mergeSongs = true, keepAlive = false, onRoomNotFound, onCommands } = {}) {
  const [syncError, setSyncError] = useState(null)
  // True when the server says this room doesn't exist (wrong code, or it expired)
  const [roomNotFound, setRoomNotFound] = useState(false)
  const [tvCurrent, setTvCurrent] = useState(undefined)
  const [tvQueue, setTvQueue] = useState(undefined)
  const [tvPaused, setTvPaused] = useState(undefined)
  const { mergeRemoteSongs } = useQueue()
  const intervalRef = useRef(null)
  const activeRef = useRef(true)
  // The room's song list is append-only, so the TV takes each request exactly once by
  // remembering how many it has read, rather than comparing against what it has played.
  const consumedRef = useRef(0)
  // Phone commands are an append-only list too, read the same way
  const commandsConsumedRef = useRef(0)
  const lastTouchRef = useRef(0)
  const onRoomNotFoundRef = useRef(onRoomNotFound)
  onRoomNotFoundRef.current = onRoomNotFound
  const onCommandsRef = useRef(onCommands)
  onCommandsRef.current = onCommands

  useEffect(() => {
    if (!roomCode) return
    activeRef.current = true
    consumedRef.current = 0
    commandsConsumedRef.current = 0
    lastTouchRef.current = 0
    setRoomNotFound(false)

    const poll = async () => {
      try {
        const touch = keepAlive && Date.now() - lastTouchRef.current >= KEEP_ALIVE_MS
        const res = await fetch(`/api/get-room?code=${encodeURIComponent(roomCode)}${touch ? '&touch=1' : ''}`)
        if (res.status === 404) {
          if (activeRef.current) {
            setRoomNotFound(true)
            setSyncError(`Room ${roomCode} not found`)
            onRoomNotFoundRef.current?.(roomCode)
          }
          return
        }
        if (!res.ok) throw new Error(`Sync failed: ${res.status}`)
        const { songs, commands, current, tvQueue, tvPaused } = await res.json()
        if (activeRef.current) {
          if (touch) lastTouchRef.current = Date.now()
          if (mergeSongs) {
            const requests = songs ?? []
            // A shorter list means the room was re-created; start reading from the top
            if (requests.length < consumedRef.current) consumedRef.current = 0
            const fresh = requests.slice(consumedRef.current)
            consumedRef.current = requests.length
            if (fresh.length > 0) mergeRemoteSongs(fresh)
          }
          if (onCommandsRef.current) {
            const list = commands ?? []
            if (list.length < commandsConsumedRef.current) commandsConsumedRef.current = 0
            const fresh = list.slice(commandsConsumedRef.current)
            commandsConsumedRef.current = list.length
            if (fresh.length > 0) onCommandsRef.current(fresh)
          }
          if (current !== undefined) setTvCurrent(current)
          if (tvQueue !== undefined) setTvQueue(tvQueue)
          if (tvPaused !== undefined) setTvPaused(tvPaused)
          setRoomNotFound(false)
          setSyncError(null)
        }
      } catch (err) {
        if (activeRef.current) setSyncError(err.message ?? 'Sync error')
      }
    }

    poll()
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      activeRef.current = false
      clearInterval(intervalRef.current)
    }
  }, [roomCode, mergeRemoteSongs, mergeSongs, keepAlive])

  return { syncError, roomNotFound, tvCurrent, tvQueue, tvPaused }
}

// onCommands receives each batch of new phone commands, oldest first
export function useRoomSync({ onCommands } = {}) {
  const [roomCode, setRoomCode] = useState(null)
  const [createError, setCreateError] = useState(null)
  const lastReclaimRef = useRef(0)

  // Pass a code to ask for that room back (used when the TV's room has gone missing)
  const createRoom = useCallback(async (requestedCode) => {
    try {
      const res = await fetch('/api/create-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(typeof requestedCode === 'string' ? { code: requestedCode } : {}),
      })
      if (!res.ok) throw new Error(`Create room failed: ${res.status}`)
      const { code } = await res.json()
      setRoomCode(code)
      setCreateError(null)
      return code
    } catch (err) {
      setCreateError(err.message ?? 'Failed to create room')
      return null
    }
  }, [])

  // If the TV's room disappears, re-create it under the same code so the QR code on
  // screen and every phone already in the room keep working.
  const reclaimRoom = useCallback((code) => {
    if (Date.now() - lastReclaimRef.current < RECLAIM_RETRY_MS) return
    lastReclaimRef.current = Date.now()
    createRoom(code)
  }, [createRoom])

  const { syncError: pollError } = useRoomPoll(roomCode, {
    keepAlive: true,
    onRoomNotFound: reclaimRoom,
    onCommands,
  })
  const syncError = createError ?? pollError

  return { roomCode, syncError, createRoom }
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.error ?? `${url} failed: ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// command: { type: 'pause' | 'resume' } | { type: 'skip', currentId }
//        | { type: 'playNow', songId } | { type: 'move', songId, afterId }
export function pushCommandToRoom(roomCode, command) {
  return postJson('/api/push-command', { roomCode, command })
}

export function pushSongToRoom(roomCode, songData, singerName = '', { playNext = false } = {}) {
  return postJson('/api/push-song', { roomCode, songData, singerName, playNext })
}
