import React, { useEffect, useRef, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import KaraokePlayer from '../components/KaraokePlayer'
import { useQueue } from '../context/QueueContext'
import { useMultiDeviceSync } from '../hooks/useMultiDeviceSync'
import { useRoomSync } from '../hooks/useRoomSync'

function thumbnailFor(song) {
  return song.thumbnail ?? `https://i.ytimg.com/vi/${song.videoId}/mqdefault.jpg`
}

function SortableTVQueueItem({ song, index, onPlayNow }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: song.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 bg-gray-800 rounded-lg p-2 pr-3"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing text-lg leading-none px-1 py-3 touch-none select-none"
        aria-label={`Drag to reorder ${song.title}`}
        data-testid={`tv-drag-handle-${index}`}
      >
        ⠿
      </button>
      <img
        src={thumbnailFor(song)}
        alt=""
        className="w-20 aspect-video object-cover rounded shrink-0 bg-gray-700"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium text-sm leading-snug line-clamp-2">{song.title}</p>
        <p className="text-gray-400 text-xs truncate">{song.artist}</p>
      </div>
      <button
        onClick={() => onPlayNow(index)}
        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0"
        aria-label={`Play ${song.title} now`}
        data-testid={`tv-play-btn-${index}`}
      >
        ▶ Play
      </button>
    </li>
  )
}

export default function TVView() {
  useMultiDeviceSync() // safe now — uses mergeRemoteSongs, never overwrites current
  const { current, queue, skip, skipTo, reorder, paused, setPaused, togglePause } = useQueue()
  const { roomCode, syncError, createRoom, lastCommand } = useRoomSync()
  // Only process commands pushed after this TV session started
  const lastSeqRef = useRef(Date.now())

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = useCallback(
    ({ active, over }) => {
      if (!over || active.id === over.id) return
      const oldIndex = queue.findIndex((s) => s.id === active.id)
      const newIndex = queue.findIndex((s) => s.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) reorder(oldIndex, newIndex)
    },
    [queue, reorder]
  )

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

  // Push current + queue to KV so all mobile clients stay in sync
  useEffect(() => {
    if (!roomCode) return
    fetch('/api/set-current', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode, song: current ?? null, queue }),
    }).catch(() => {})
  }, [current, queue, roomCode])

  const joinHost = typeof window !== 'undefined' ? window.location.host : ''

  return (
    <div
      className="h-screen bg-black text-white flex flex-col lg:flex-row overflow-hidden"
      data-testid="tv-view"
    >
      {/* Left: player, as large as the column allows */}
      <main className="flex-1 min-w-0 min-h-0 flex items-center justify-center bg-black">
        {current ? (
          <KaraokePlayer
            song={current}
            onSkip={skip}
            externalPaused={paused}
            onTogglePause={togglePause}
            showControls={false}
            maxVideoHeight="100vh"
          />
        ) : (
          <div className="text-center px-8" data-testid="player-empty">
            <p className="text-3xl font-semibold text-gray-300">No song playing</p>
            <p className="mt-4 text-lg text-gray-500">
              On your phone, open <span className="text-white font-medium">{joinHost}</span>
            </p>
            <p className="text-lg text-gray-500">
              and enter room code{' '}
              <span className="text-purple-300 font-mono font-bold tracking-widest">{roomCode ?? '…'}</span>
            </p>
          </div>
        )}
      </main>

      {/* Right: room code, now playing, controls, up next */}
      <aside className="w-full lg:w-[400px] xl:w-[440px] shrink-0 min-h-0 max-h-[55vh] lg:max-h-none bg-gray-900 border-t lg:border-t-0 lg:border-l border-gray-800 flex flex-col">
        <div className="px-5 pt-4 pb-3 border-b border-gray-800 flex items-end justify-between gap-3 shrink-0">
          <h1 className="text-lg font-bold text-purple-400">Karaoke Queue</h1>
          {roomCode && (
            <div className="text-right" data-testid="room-code-badge">
              <p className="text-gray-500 text-[11px] uppercase tracking-widest">Room Code</p>
              <p className="text-purple-300 font-mono text-2xl font-bold tracking-widest leading-none" data-testid="room-code">
                {roomCode}
              </p>
            </div>
          )}
        </div>

        <section className="px-5 py-4 border-b border-gray-800 shrink-0">
          <p className="text-xs text-purple-400 uppercase tracking-widest font-semibold mb-2">Now Playing</p>
          {current ? (
            <div data-testid="tv-now-playing">
              <p className="text-xl font-semibold leading-snug line-clamp-3">{current.title}</p>
              <p className="text-gray-400 text-sm truncate mt-1">{current.artist}</p>
            </div>
          ) : (
            <p className="text-gray-600">Nothing playing</p>
          )}
          <div className="flex gap-3 mt-4">
            <button
              onClick={togglePause}
              disabled={!current}
              className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-full font-medium transition-colors"
              aria-label={paused ? 'Play' : 'Pause'}
              data-testid="tv-play-pause-btn"
            >
              {paused ? '▶ Play' : '⏸ Pause'}
            </button>
            <button
              onClick={skip}
              disabled={!current && queue.length === 0}
              className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-full font-medium transition-colors whitespace-nowrap"
              aria-label="Next Song"
              data-testid="tv-next-btn"
            >
              Next Song ⏭
            </button>
          </div>
        </section>

        <div className="px-5 pt-4 pb-2 flex items-center justify-between shrink-0">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">
            Up Next — {queue.length} song{queue.length !== 1 ? 's' : ''}
          </p>
          {queue.length > 1 && <span className="text-xs text-gray-600">drag ⠿ to reorder</span>}
        </div>

        {queue.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-5 pb-6" data-testid="queue-empty-bar">
            <p className="text-gray-600 text-sm text-center">Queue is empty — add songs from your phone</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={queue.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <ul className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 space-y-2" data-testid="tv-queue-list">
                {queue.map((song, i) => (
                  <SortableTVQueueItem key={song.id} song={song} index={i} onPlayNow={skipTo} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {syncError && (
          <p className="px-5 py-2 text-xs text-red-500 border-t border-gray-800 shrink-0" data-testid="sync-error">
            {syncError}
          </p>
        )}
      </aside>
    </div>
  )
}
