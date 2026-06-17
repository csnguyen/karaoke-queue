import React, { useState, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQueue } from '../context/QueueContext'
import { useYouTubeSearch } from '../hooks/useYouTubeSearch'
import { pushSongToRoom, pushCommandToRoom, useRoomPoll } from '../hooks/useRoomSync'

function formatCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function SortableQueueItem({ song, index, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: song.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 bg-gray-800 rounded-lg p-3 touch-none"
    >
      {/* drag handle */}
      <span
        {...attributes}
        {...listeners}
        className="text-gray-500 cursor-grab active:cursor-grabbing text-lg select-none px-1"
        aria-label="Drag to reorder"
      >
        ⠿
      </span>
      <span className="text-gray-500 text-xs w-4 text-center shrink-0">{index + 1}</span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{song.title}</p>
        <p className="text-xs text-gray-400 truncate">{song.artist}</p>
      </div>
      <button
        onClick={() => onRemove(song.id)}
        className="text-gray-600 hover:text-red-400 transition-colors text-lg leading-none shrink-0"
        aria-label={`Remove ${song.title}`}
      >
        ×
      </button>
    </li>
  )
}

export default function MobileView() {
  const [query, setQuery] = useState('')
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [activeRoom, setActiveRoom] = useState(null)
  const [roomError, setRoomError] = useState(null)
  const { current, queue, paused, addSong, addNext, removeSong, skip, reorder, togglePause } = useQueue()
  const { results, loading, loadingMore, error, search, loadMore, hasMore } = useYouTubeSearch()
  const { tvCurrent, tvQueue: remoteTvQueue } = useRoomPoll(activeRoom)
  // When in a room, mirror TV's state; fall back to local state otherwise
  const nowPlaying = activeRoom ? (tvCurrent ?? null) : current
  const displayQueue = activeRoom && remoteTvQueue !== undefined ? remoteTvQueue : queue

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
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

  const handleSearch = (e) => {
    e.preventDefault()
    if (query.trim()) search(query.trim())
  }

  const handleJoinRoom = (e) => {
    e.preventDefault()
    const code = roomCodeInput.trim().toUpperCase()
    if (!/^[A-Z0-9]{4}$/.test(code)) {
      setRoomError('Enter a valid 4-character room code')
      return
    }
    setActiveRoom(code)
    setRoomError(null)
  }

  const pushSong = useCallback(
    async (song, mode) => {
      if (mode === 'next') addNext(song)
      else addSong(song)
      if (activeRoom) {
        try { await pushSongToRoom(activeRoom, song) } catch { }
      }
    },
    [activeRoom, addSong, addNext]
  )

  const handlePlayPause = useCallback(async () => {
    if (activeRoom) {
      const cmd = paused ? 'resume' : 'pause'
      try { await pushCommandToRoom(activeRoom, cmd) } catch { }
    }
    togglePause()
  }, [activeRoom, paused, togglePause])

  const handleSkip = useCallback(async () => {
    if (activeRoom) {
      try { await pushCommandToRoom(activeRoom, 'skip') } catch { }
    } else {
      skip()
    }
  }, [activeRoom, skip])

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="p-4 bg-gray-800 border-b border-gray-700">
        <h1 className="text-xl font-bold text-purple-400 mb-3">Karaoke Queue</h1>

        <form onSubmit={handleJoinRoom} className="flex gap-2 mb-3">
          <input
            type="text"
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="Room code (e.g. KARA)"
            maxLength={4}
            className="flex-1 px-3 py-2 bg-gray-700 rounded-lg text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-purple-500 font-mono tracking-widest uppercase"
            data-testid="room-code-input"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-purple-800 hover:bg-purple-700 rounded-lg font-medium text-sm transition-colors whitespace-nowrap"
            data-testid="join-room-btn"
          >
            {activeRoom ? `✓ ${activeRoom}` : 'Join'}
          </button>
        </form>
        {roomError && (
          <p className="text-red-400 text-xs mb-2" data-testid="room-error">{roomError}</p>
        )}

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a song..."
            className="flex-1 px-3 py-2 bg-gray-700 rounded-lg text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-purple-500"
            data-testid="search-input"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg font-medium transition-colors"
            data-testid="search-btn"
          >
            {loading ? '…' : 'Search'}
          </button>
        </form>
        {error && <p className="text-red-400 text-sm mt-2" data-testid="search-error">{error}</p>}
      </header>

      {results.length > 0 && (
        <section className="p-4 border-b border-gray-700">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Results</h2>
          <ul className="space-y-2" data-testid="search-results">
            {results.map((song) => (
              <li key={song.id} className="bg-gray-800 rounded-lg overflow-hidden">
                {/* Top row: thumbnail + title/meta */}
                <div className="flex items-start gap-3 p-3">
                  {song.thumbnail ? (
                    <img
                      src={song.thumbnail}
                      alt=""
                      className="w-28 h-[63px] object-cover rounded shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-28 h-[63px] bg-gray-700 rounded shrink-0 flex items-center justify-center text-gray-600 text-2xl">♪</div>
                  )}
                  <div className="flex-1 min-w-0">
                    {/* No truncate — title wraps so full text is readable */}
                    <p className="font-medium text-sm leading-snug text-white">{song.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{song.artist}</p>
                    {song.viewCount > 0 && (
                      <p className="text-xs text-gray-600 mt-0.5">{formatCount(song.viewCount)} views</p>
                    )}
                  </div>
                </div>
                {/* Bottom row: action buttons */}
                <div className="flex gap-2 px-3 pb-3">
                  <button
                    onClick={() => pushSong(song, 'next')}
                    className="flex-1 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-xs rounded-full font-medium transition-colors"
                    aria-label={`Play ${song.title} next`}
                  >
                    ▶ Play Next
                  </button>
                  <button
                    onClick={() => pushSong(song, 'queue')}
                    className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-700 text-xs rounded-full font-medium transition-colors"
                    aria-label={`Add ${song.title} to queue`}
                  >
                    + Add to Queue
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full mt-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              data-testid="load-more-btn"
            >
              {loadingMore ? 'Loading…' : 'Load more results'}
            </button>
          )}
        </section>
      )}

      <section className="flex-1 p-4">
        {/* Now Playing */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Now Playing</h2>
        </div>

        {nowPlaying ? (
          <div className="bg-purple-900/40 border border-purple-700 rounded-lg p-3 mb-3" data-testid="now-playing">
            <p className="font-semibold text-sm truncate">{nowPlaying.title}</p>
            <p className="text-xs text-gray-400 truncate">{nowPlaying.artist}</p>
          </div>
        ) : (
          <p className="text-gray-600 text-sm mb-3" data-testid="nothing-playing">Nothing playing</p>
        )}

        {/* Playback controls — when in a room these act as a TV remote */}
        <div className="flex items-center justify-center gap-4 mb-4" data-testid="playback-controls">
          <button
            onClick={handlePlayPause}
            disabled={!activeRoom && !current}
            className="flex items-center justify-center w-14 h-14 rounded-full bg-purple-600 hover:bg-purple-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-2xl"
            aria-label={paused ? 'Play' : 'Pause'}
            data-testid="mobile-play-pause-btn"
          >
            {paused ? '▶' : '⏸'}
          </button>
          <button
            onClick={handleSkip}
            disabled={!activeRoom && !current && queue.length === 0}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xl"
            aria-label="Next"
            data-testid="mobile-skip-btn"
          >
            ⏭
          </button>
        </div>

        {/* Start Playing button when queue has songs but nothing playing (local only) */}
        {!current && !activeRoom && queue.length > 0 && (
          <button
            onClick={skip}
            className="w-full mb-4 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold text-sm transition-colors"
            data-testid="start-playing-btn"
          >
            ▶ Start Playing
          </button>
        )}

        {/* Queue — mirrors TV's queue when in a room */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Queue ({displayQueue.length})
          </h2>
          {!activeRoom && displayQueue.length > 1 && (
            <span className="text-xs text-gray-600">hold & drag to reorder</span>
          )}
        </div>

        {displayQueue.length === 0 ? (
          <p className="text-gray-600 text-sm" data-testid="queue-empty">Search for songs to add to the queue</p>
        ) : activeRoom ? (
          <ul className="space-y-2" data-testid="queue-list">
            {displayQueue.map((song, i) => (
              <li key={song.id} className="flex items-center gap-3 bg-gray-800 rounded-lg p-3">
                <span className="text-gray-500 text-xs w-4 text-center shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{song.title}</p>
                  <p className="text-xs text-gray-400 truncate">{song.artist}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={displayQueue.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2" data-testid="queue-list">
                {displayQueue.map((song, i) => (
                  <SortableQueueItem
                    key={song.id}
                    song={song}
                    index={i}
                    onRemove={removeSong}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </section>
    </div>
  )
}
