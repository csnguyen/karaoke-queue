import { useState, useEffect, useCallback, useRef } from 'react'
import { useQueue } from '../context/QueueContext'

export const POLL_INTERVAL_MS = 2500

export function useRoomSync() {
  const [roomCode, setRoomCode] = useState(null)
  const [syncError, setSyncError] = useState(null)
  const { mergeRemoteSongs } = useQueue()
  const intervalRef = useRef(null)
  const activeRef = useRef(true)

  const createRoom = useCallback(async () => {
    try {
      const res = await fetch('/api/create-room', { method: 'POST' })
      if (!res.ok) throw new Error(`Create room failed: ${res.status}`)
      const { code } = await res.json()
      setRoomCode(code)
      setSyncError(null)
      return code
    } catch (err) {
      setSyncError(err.message ?? 'Failed to create room')
      return null
    }
  }, [])

  const poll = useCallback(
    async (code) => {
      try {
        const res = await fetch(`/api/get-room?code=${encodeURIComponent(code)}`)
        if (!res.ok) throw new Error(`Sync failed: ${res.status}`)
        const { songs } = await res.json()
        if (activeRef.current) {
          mergeRemoteSongs(songs ?? [])
          setSyncError(null)
        }
      } catch (err) {
        if (activeRef.current) {
          setSyncError(err.message ?? 'Sync error')
        }
      }
    },
    [mergeRemoteSongs]
  )

  useEffect(() => {
    if (!roomCode) return
    activeRef.current = true
    poll(roomCode)
    intervalRef.current = setInterval(() => poll(roomCode), POLL_INTERVAL_MS)
    return () => {
      activeRef.current = false
      clearInterval(intervalRef.current)
    }
  }, [roomCode, poll])

  return { roomCode, syncError, createRoom }
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
