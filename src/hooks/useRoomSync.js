import { useState, useEffect, useCallback, useRef } from 'react'
import { useQueue } from '../context/QueueContext'

export const POLL_INTERVAL_MS = 2500

// Polls a room code. The TV (mergeSongs: true) adds newly requested songs to its queue;
// phones only read the TV's current song and queue from the response.
export function useRoomPoll(roomCode, { mergeSongs = true } = {}) {
  const [syncError, setSyncError] = useState(null)
  const [lastCommand, setLastCommand] = useState(null)
  const [tvCurrent, setTvCurrent] = useState(undefined)
  const [tvQueue, setTvQueue] = useState(undefined)
  const { mergeRemoteSongs } = useQueue()
  const intervalRef = useRef(null)
  const activeRef = useRef(true)
  // The room's song list is append-only, so the TV takes each request exactly once by
  // remembering how many it has read, rather than comparing against what it has played.
  const consumedRef = useRef(0)

  useEffect(() => {
    if (!roomCode) return
    activeRef.current = true
    consumedRef.current = 0

    const poll = async () => {
      try {
        const res = await fetch(`/api/get-room?code=${encodeURIComponent(roomCode)}`)
        if (!res.ok) throw new Error(`Sync failed: ${res.status}`)
        const { songs, command, current, tvQueue } = await res.json()
        if (activeRef.current) {
          if (mergeSongs) {
            const requests = songs ?? []
            const fresh = requests.slice(consumedRef.current)
            consumedRef.current = Math.max(consumedRef.current, requests.length)
            if (fresh.length > 0) mergeRemoteSongs(fresh)
          }
          if (command) setLastCommand(command)
          if (current !== undefined) setTvCurrent(current)
          if (tvQueue !== undefined) setTvQueue(tvQueue)
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
  }, [roomCode, mergeRemoteSongs, mergeSongs])

  return { syncError, lastCommand, tvCurrent, tvQueue }
}

export function useRoomSync() {
  const [roomCode, setRoomCode] = useState(null)
  const [createError, setCreateError] = useState(null)
  const { syncError: pollError, lastCommand } = useRoomPoll(roomCode)
  const syncError = createError ?? pollError

  const createRoom = useCallback(async () => {
    try {
      const res = await fetch('/api/create-room', { method: 'POST' })
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

  return { roomCode, syncError, createRoom, lastCommand }
}

export async function pushCommandToRoom(roomCode, command) {
  const res = await fetch('/api/push-command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomCode, command }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `push-command failed: ${res.status}`)
  }
  return res.json()
}

export async function pushSongToRoom(roomCode, songData, singerName = '', { playNext = false } = {}) {
  const res = await fetch('/api/push-song', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomCode, songData, singerName, playNext }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `push-song failed: ${res.status}`)
  }
  return res.json()
}
