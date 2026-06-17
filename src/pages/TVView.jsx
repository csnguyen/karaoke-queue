import React, { useEffect } from 'react'
import KaraokePlayer from '../components/KaraokePlayer'
import { useQueue } from '../context/QueueContext'
import { useMultiDeviceSync } from '../hooks/useMultiDeviceSync'
import { useRoomSync } from '../hooks/useRoomSync'

export default function TVView() {
  useMultiDeviceSync()
  const { current, queue, skip } = useQueue()
  const { roomCode, syncError, createRoom } = useRoomSync()

  useEffect(() => {
    createRoom()
  }, [createRoom])

  const queueText = queue.length > 0
    ? queue.map((s) => `${s.title} — ${s.artist}`).join('   ·   ')
    : null

  return (
    <div className="min-h-screen bg-black flex flex-col" data-testid="tv-view">
      <div className="flex-1 relative">
        <KaraokePlayer song={current} onSkip={skip} />

        {roomCode && (
          <div
            className="absolute top-3 right-4 bg-black/70 border border-purple-600 rounded-lg px-3 py-2 text-right"
            data-testid="room-code-badge"
          >
            <p className="text-gray-400 text-xs uppercase tracking-widest">Room Code</p>
            <p className="text-purple-300 font-mono text-2xl font-bold tracking-widest" data-testid="room-code">
              {roomCode}
            </p>
          </div>
        )}

        {syncError && (
          <p className="absolute bottom-2 right-4 text-xs text-red-500" data-testid="sync-error">
            {syncError}
          </p>
        )}
      </div>

      {queueText ? (
        <div className="bg-gray-900 border-t border-gray-700 py-2 overflow-hidden" data-testid="marquee-bar">
          <p className="text-xs text-gray-500 uppercase tracking-widest px-4 mb-1">Up Next</p>
          <div className="overflow-hidden">
            <p
              className="whitespace-nowrap animate-marquee text-white text-sm"
              data-testid="queue-marquee"
            >
              {queueText}
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-gray-900 border-t border-gray-700 py-3 px-4 text-center" data-testid="queue-empty-bar">
          <p className="text-gray-500 text-sm">
            Queue is empty — enter room code <strong className="text-purple-400">{roomCode ?? '…'}</strong> on your phone to add songs
          </p>
        </div>
      )}
    </div>
  )
}
