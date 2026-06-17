import { useEffect } from 'react'
import { useQueue } from '../context/QueueContext'

const STORAGE_KEY = 'karaoke-queue'

export function useMultiDeviceSync() {
  const { mergeRemoteSongs } = useQueue()

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key !== STORAGE_KEY || e.newValue === null) return
      try {
        const state = JSON.parse(e.newValue)
        // Merge current + queue from the other tab as incoming songs.
        // mergeRemoteSongs deduplicates so TV's playing song is never interrupted.
        const incoming = [
          ...(state.current ? [state.current] : []),
          ...(state.queue ?? []),
        ]
        mergeRemoteSongs(incoming)
      } catch {
        // ignore malformed storage data
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [mergeRemoteSongs])
}
