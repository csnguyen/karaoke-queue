import { useState, useEffect, useCallback, useRef } from 'react'
import { useQueue } from '../context/QueueContext'

export const POLL_INTERVAL_MS = 2500

// Polls a room code and merges incoming songs into the local queue.
// Used by both TVView (after createRoom) and MobileView (after joining a room).
export function useRoomPoll(roomCode) {
  const [syncError, setSyncError] = useState(null)
  const [lastCommand, setLastCommand] = useState(null)
  const [tvCurrent, setTvCurrent] = useState(undefined)
  const { mergeRemoteSongs } = useQueue()
  const intervalRef = useRef(null)
  const activeRef = useRef(true)

  useEffect(() => {
    if (!roomCode) return
    activeRef.current = true

    const poll = async () => {
      try {
        const res = await fetch(`/api/get-room?code=${encodeURIComponent(roomCode)}`)
        if (!res.ok) throw new Error(`Sync failed: ${res.status}`)
        const { songs, command, current } = await res.json()
        if (activeRef.current) {
          mergeRemoteSongs(songs ?? [])
          if (command) setLastCommand(command)
          // current is only present once TV has set it (undefined = not yet set)
          if (current !== undefined) setTvCurrent(current)
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
  }, [roomCode, mergeRemoteSongs])

  return { syncError, lastCommand, tvCurrent }
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

export async function pushSongToRoom(roomCode, songData, singerName = '') {
  const res = await fetch('/api/push-song', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomCode, songData, singerName }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `push-song failed: ${res.status}`)
  }
  return res.json()
}
