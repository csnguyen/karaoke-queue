import React, { useState, useCallback, useRef, useEffect } from 'react'
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

const SINGER_STORAGE_KEY = 'karaoke-singer-name'
const SINGER_MAX_LENGTH = 30
const ROOM_CODE_RE = /^[A-Z0-9]{4}$/

const FIELD_LABEL_CLASS = 'w-12 shrink-0 text-sm font-semibold text-gray-300'
const FIELD_INPUT_CLASS =
  'flex-1 min-w-0 px-2.5 py-2 bg-gray-700 rounded-lg text-white text-sm placeholder-gray-400 outline-none focus:ring-2'
const INVALID_RING_CLASS = 'ring-2 ring-red-500 focus:ring-red-500'
// Indented to line up under the inputs (label width + gap)
const FIELD_ERROR_CLASS = 'text-red-400 text-xs mt-1 ml-14'

// Remembered per device so returning singers don't retype their name
function loadSingerName() {
  try { return localStorage.getItem(SINGER_STORAGE_KEY) ?? '' } catch { return '' }
}

function formatCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function SingerLine({ song }) {
  if (!song.singerName) return null
  return <p className="text-xs text-purple-300 truncate">🎤 {song.singerName}</p>
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
        <SingerLine song={song} />
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
  const [singerName, setSingerName] = useState(loadSingerName)
  const [singerError, setSingerError] = useState(false)
  const singerInputRef = useRef(null)
  const roomInputRef = useRef(null)
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)

  const handleSingerChange = (e) => {
    const name = e.target.value.slice(0, SINGER_MAX_LENGTH)
    setSingerName(name)
    if (name.trim()) setSingerError(false)
    try { localStorage.setItem(SINGER_STORAGE_KEY, name) } catch {}
  }

  const showToast = useCallback((message) => {
    clearTimeout(toastTimerRef.current)
    setToast({ message, key: Date.now() })
    toastTimerRef.current = setTimeout(() => setToast(null), 2500)
  }, [])

  useEffect(() => () => clearTimeout(toastTimerRef.current), [])
  const { current, queue, addSong, addNext, removeSong, skip, reorder } = useQueue()
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

  const handleRoomCodeChange = (e) => {
    const code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
    setRoomCodeInput(code)
    if (roomError && ROOM_CODE_RE.test(code)) setRoomError(null)
  }

  const handleJoinRoom = (e) => {
    e.preventDefault()
    const code = roomCodeInput.trim().toUpperCase()
    if (!ROOM_CODE_RE.test(code)) {
      setRoomError('Enter the 4-character room code shown on the TV')
      return
    }
    setActiveRoom(code)
    setRoomError(null)
  }

  const pushSong = useCallback(
    async (result, mode) => {
      const name = singerName.trim()
      // A complete code that hasn't been "Joined" yet still counts — join it now
      let room = activeRoom
      const typedCode = roomCodeInput.trim().toUpperCase()
      if (!room && ROOM_CODE_RE.test(typedCode)) {
        room = typedCode
        setActiveRoom(typedCode)
        setRoomError(null)
      }

      if (!name || !room) {
        setSingerError(!name)
        if (!room) setRoomError('Enter the 4-character room code shown on the TV')
        const firstMissing = !name ? singerInputRef.current : roomInputRef.current
        firstMissing?.focus()
        firstMissing?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
        const missing = [!name && 'your Singer name', !room && 'the Room code from the TV'].filter(Boolean)
        showToast(`Enter ${missing.join(' and ')} before adding a song`)
        return
      }

      const song = { ...result, singerName: name }
      if (mode === 'next') addNext(song)
      else addSong(song)
      showToast(mode === 'next' ? `▶ Playing next: ${song.title}` : `✓ Added to queue: ${song.title}`)
      try { await pushSongToRoom(room, song, name) } catch {
        showToast(`⚠ Couldn't send "${song.title}" to the TV — check the room code`)
      }
    },
    [activeRoom, roomCodeInput, addSong, addNext, showToast, singerName]
  )

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

        <div className="flex items-center gap-2 mb-1">
          <label htmlFor="singer-name" className={FIELD_LABEL_CLASS}>Singer</label>
          <input
            id="singer-name"
            ref={singerInputRef}
            type="text"
            value={singerName}
            onChange={handleSingerChange}
            placeholder="Your Name"
            required
            aria-required="true"
            aria-invalid={singerError}
            aria-describedby={singerError ? 'singer-error' : undefined}
            autoComplete="nickname"
            maxLength={SINGER_MAX_LENGTH}
            className={`${FIELD_INPUT_CLASS} ${singerError ? INVALID_RING_CLASS : 'focus:ring-purple-500'}`}
            data-testid="singer-input"
          />
        </div>
        {singerError && (
          <p id="singer-error" className={FIELD_ERROR_CLASS} data-testid="singer-error">
            Required — your name shows on the TV when it's your turn
          </p>
        )}

        <form onSubmit={handleJoinRoom} className="flex items-center gap-2 mt-2 mb-1">
          <label htmlFor="room-code" className={FIELD_LABEL_CLASS}>Room</label>
          <input
            id="room-code"
            ref={roomInputRef}
            type="text"
            value={roomCodeInput}
            onChange={handleRoomCodeChange}
            placeholder="Room Code (4 letter code on TV)"
            required
            aria-required="true"
            aria-invalid={!!roomError}
            aria-describedby={roomError ? 'room-error' : undefined}
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={4}
            className={`${FIELD_INPUT_CLASS} font-mono tracking-widest uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case placeholder:text-xs ${
              roomError ? INVALID_RING_CLASS : 'focus:ring-purple-500'
            }`}
            data-testid="room-code-input"
          />
          <button
            type="submit"
            className="px-2.5 py-2 bg-purple-800 hover:bg-purple-700 rounded-lg font-medium text-sm transition-colors whitespace-nowrap shrink-0"
            data-testid="join-room-btn"
          >
            {activeRoom ? `✓ ${activeRoom}` : 'Join'}
          </button>
        </form>
        {roomError && (
          <p id="room-error" className={FIELD_ERROR_CLASS} data-testid="room-error">{roomError}</p>
        )}

        <form onSubmit={handleSearch} className="flex items-center gap-2 mt-2">
          <label htmlFor="song-search" className={FIELD_LABEL_CLASS}>Song</label>
          <input
            id="song-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search song or artist name"
            className={`${FIELD_INPUT_CLASS} focus:ring-purple-500`}
            data-testid="search-input"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-2.5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg font-medium text-sm transition-colors shrink-0"
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
                    onClick={() => pushSong(song, 'queue')}
                    className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-700 text-xs rounded-full font-medium transition-colors"
                    aria-label={`Add ${song.title} to queue`}
                  >
                    + Add to Queue
                  </button>
                  <button
                    onClick={() => pushSong(song, 'next')}
                    className="flex-1 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-xs rounded-full font-medium transition-colors"
                    aria-label={`Play ${song.title} next`}
                  >
                    ▶ Play Next
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
            <SingerLine song={nowPlaying} />
          </div>
        ) : (
          <p className="text-gray-600 text-sm mb-3" data-testid="nothing-playing">Nothing playing</p>
        )}

        {/* Play/pause lives on the TV only; phones can still move to the next song */}
        <button
          onClick={handleSkip}
          disabled={!activeRoom && !current && queue.length === 0}
          className="w-full mb-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
          aria-label="Next Song"
          data-testid="mobile-skip-btn"
        >
          Next Song ⏭
        </button>

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
                  <SingerLine song={song} />
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

      {toast && (
        <div
          key={toast.key}
          role="status"
          aria-live="polite"
          className="fixed left-4 right-4 z-50 mx-auto max-w-md bg-gray-100 text-gray-900 rounded-lg shadow-lg px-4 py-3 text-sm font-medium"
          style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          data-testid="toast"
        >
          <p className="line-clamp-2">{toast.message}</p>
        </div>
      )}
    </div>
  )
}
