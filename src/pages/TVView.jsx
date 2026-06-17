import React, { useEffect, useRef } from 'react'
import KaraokePlayer from '../components/KaraokePlayer'
import { useQueue } from '../context/QueueContext'
import { useMultiDeviceSync } from '../hooks/useMultiDeviceSync'
import { useRoomSync } from '../hooks/useRoomSync'

export default function TVView() {
  useMultiDeviceSync() // safe now — uses mergeRemoteSongs, never overwrites current
  const { current, queue, skip, skipTo, paused, setPaused } = useQueue()
  const { roomCode, syncError, createRoom, lastCommand } = useRoomSync()
  // Only process commands pushed after this TV session started
  const lastSeqRef = useRef(Date.now())

  useEffect(() => {
    createRoom()
  }, [createRoom])

  // Auto-advance only when nothing is playing and queue is non-empty
  useEffect(() => {
    if (!current && queue.length > 0) skip()
  }, [current, queue, skip])

  // Process remote commands from mobile devices
  useEffect(() => {
    if (!lastCommand || lastCommand.seq <= lastSeqRef.current) return
    lastSeqRef.current = lastCommand.seq
    if (lastCommand.type === 'skip') skip()
    else if (lastCommand.type === 'pause') setPaused(true)
    else if (lastCommand.type === 'resume') setPaused(false)
  }, [lastCommand, skip, setPaused])

  return (
    <div className="min-h-screen bg-black flex flex-col" data-testid="tv-view">

      {/* Player */}
      <div className="relative">
        <KaraokePlayer song={current} onSkip={skip} externalPaused={paused} />

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

      {/* Queue panel */}
      <div className="flex-1 bg-gray-900 border-t border-gray-700 overflow-hidden flex flex-col">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between shrink-0">
          <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">
            Up Next — {queue.length} song{queue.length !== 1 ? 's' : ''}
          </p>
          {!current && queue.length === 0 && (
            <p className="text-gray-600 text-xs">
              Enter room code <span className="text-purple-400 font-mono font-bold">{roomCode ?? '…'}</span> on your phone to add songs
            </p>
          )}
        </div>

        {queue.length === 0 ? (
          <div className="flex-1 flex items-center justify-center" data-testid="queue-empty-bar">
            <p className="text-gray-700 text-sm">Queue is empty</p>
          </div>
        ) : (
          <ul className="overflow-y-auto flex-1 px-4 pb-4 space-y-2" data-testid="tv-queue-list">
            {queue.map((song, i) => (
              <li
                key={song.id}
                className="flex items-center gap-3 bg-gray-800 hover:bg-gray-750 rounded-lg px-4 py-3"
              >
                <span className="text-gray-600 text-sm w-5 text-center shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{song.title}</p>
                  <p className="text-gray-400 text-xs truncate">{song.artist}</p>
                </div>
                <button
                  onClick={() => skipTo(i)}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0"
                  aria-label={`Play ${song.title} now`}
                  data-testid={`tv-play-btn-${i}`}
                >
                  ▶ Play Now
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  )
}
