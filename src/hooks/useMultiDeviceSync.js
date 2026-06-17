import { useEffect } from 'react'
import { useQueue } from '../context/QueueContext'

const STORAGE_KEY = 'karaoke-queue'

export function useMultiDeviceSync() {
  const { restore } = useQueue()

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key !== STORAGE_KEY || e.newValue === null) return
      try {
        restore(JSON.parse(e.newValue))
      } catch {
        // ignore malformed data
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [restore])
}
