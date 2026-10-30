import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
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
import { useYouTubeSearch } from '../hooks/useYouTubeSearch'
import { pushSongToRoom, pushCommandToRoom, useRoomPoll } from '../hooks/useRoomSync'
import { APP_NAME } from '../appName'
import { roomCodeFromSearch } from '../roomLink'
import { planMove } from '../queueMove'
import ConfirmDialog from '../components/ConfirmDialog'

const SINGER_STORAGE_KEY = 'karaoke-singer-name'
const SINGER_MAX_LENGTH = 30
const ROOM_CODE_RE = /^[A-Z0-9]{4}$/

const roomNotFoundMessage = (code) =>
  `Room ${code} wasn't found — check the code on the TV, or scan its QR code`
// How long an optimistic change (reorder, play/pause) is shown while waiting for the TV
const PENDING_MS = 8000

function thumbnailFor(song) {
  return song.thumbnail ?? `https://i.ytimg.com/vi/${song.videoId}/mqdefault.jpg`
}

const FIELD_LABEL_CLASS = 'w-12 shrink-0 text-sm font-semibold text-gray-300'
// 16px text: iPhone browsers zoom the page into any field with smaller text when it's tapped.
// Placeholders can stay smaller (set per field) since only the typed text size matters.
const FIELD_INPUT_CLASS =
  'flex-1 min-w-0 px-2.5 py-2 bg-gray-700 rounded-lg text-white text-base placeholder-gray-400 outline-none focus:ring-2'
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

// Same row as the TV sidebar: drag handle, thumbnail, title, singer and Play
function SortableQueueItem({ song, index, onPlayNow, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: song.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <li ref={setNodeRef} style={style} className="relative flex items-center gap-2 bg-gray-800 rounded-lg p-2 pr-3">
      {/* Only the handle starts a drag, so the list still scrolls normally on touch */}
      <button
        {...attributes}
        {...listeners}
        className="text-gray-500 cursor-grab active:cursor-grabbing text-xl leading-none px-1.5 py-3 touch-none select-none"
        aria-label={`Drag to reorder ${song.title}`}
        data-testid={`queue-drag-handle-${index}`}
      >
        ⠿
      </button>
      <img
        src={thumbnailFor(song)}
        alt=""
        className="w-16 aspect-video object-cover rounded shrink-0 bg-gray-700"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm leading-snug line-clamp-2">{song.title}</p>
        {song.singerName ? <SingerLine song={song} /> : <p className="text-xs text-gray-400 truncate">{song.artist}</p>}
      </div>
      <button
        onClick={() => onPlayNow(song)}
        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0"
        aria-label={`Play ${song.title} now`}
        data-testid={`queue-play-btn-${index}`}
      >
        ▶ Play
      </button>
      <button
        onClick={() => onRemove(song)}
        className="w-8 h-8 -mr-1.5 shrink-0 flex items-center justify-center rounded-full text-gray-500 hover:text-red-400 active:bg-gray-700 text-xl leading-none"
        aria-label={`Remove ${song.title} from the queue`}
        data-testid={`queue-remove-btn-${index}`}
      >
        ×
      </button>
    </li>
  )
}

function TabButton({ id, selected, onSelect, children }) {
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={selected}
      aria-controls={`panel-${id}`}
      onClick={() => onSelect(id)}
      className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${
        selected ? 'border-purple-400 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
      }`}
      data-testid={`tab-${id}`}
    >
      {children}
    </button>
  )
}

export default function MobileView() {
  const [query, setQuery] = useState('')
  // Arriving from the TV's QR code (/?room=ABCD) joins that room straight away
  const [roomFromLink] = useState(() => roomCodeFromSearch(window.location.search))
  const [roomCodeInput, setRoomCodeInput] = useState(roomFromLink ?? '')
  const [activeRoom, setActiveRoom] = useState(roomFromLink)
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
  const { results, loading, loadingMore, error, search, loadMore, hasMore } = useYouTubeSearch()
  // The TV owns the queue and playback; the phone mirrors it and sends commands
  const { tvCurrent, tvQueue, tvPaused, roomNotFound } = useRoomPoll(activeRoom, { mergeSongs: false })
  // Checked as soon as a code is joined, so a mistyped code is caught before adding songs
  const roomMissing = !!activeRoom && roomNotFound
  const shownRoomError = roomError ?? (roomMissing ? roomNotFoundMessage(activeRoom) : null)
  const connected = !!activeRoom && !roomMissing
  const nowPlaying = activeRoom ? (tvCurrent ?? null) : null
  const [activeTab, setActiveTab] = useState('results')

  // Optimistic changes, shown until the TV's next update reflects them (or they time out)
  const [pendingOrder, setPendingOrder] = useState(null) // { ids, expires }
  const [pendingPaused, setPendingPaused] = useState(null) // { value, expires }
  const [pendingRemovals, setPendingRemovals] = useState({}) // { [songId]: expires }
  const [songToRemove, setSongToRemove] = useState(null)

  const displayQueue = useMemo(() => {
    const base = (tvQueue ?? []).filter((s) => !(s.id in pendingRemovals))
    if (!pendingOrder) return base
    const rank = new Map(pendingOrder.ids.map((id, i) => [id, i]))
    // Songs added on the TV since the drag keep their place at the end
    return [...base].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity))
  }, [tvQueue, pendingOrder, pendingRemovals])

  // A removed song stays hidden until the TV's queue no longer lists it
  useEffect(() => {
    const ids = Object.keys(pendingRemovals)
    if (ids.length === 0) return
    const listed = new Set((tvQueue ?? []).map((s) => s.id))
    const stillPending = ids.filter((id) => listed.has(id) && pendingRemovals[id] > Date.now())
    if (stillPending.length !== ids.length) {
      setPendingRemovals(Object.fromEntries(stillPending.map((id) => [id, pendingRemovals[id]])))
      return
    }
    const soonest = Math.min(...ids.map((id) => pendingRemovals[id]))
    const timer = setTimeout(() => setPendingRemovals((p) => ({ ...p })), soonest - Date.now())
    return () => clearTimeout(timer)
  }, [tvQueue, pendingRemovals])

  useEffect(() => {
    if (!pendingOrder) return
    // Caught up when the TV lists the dragged songs in the same relative order
    const pending = new Set(pendingOrder.ids)
    const tvOrder = (tvQueue ?? []).map((s) => s.id).filter((id) => pending.has(id))
    const wanted = pendingOrder.ids.filter((id) => tvOrder.includes(id))
    if (tvOrder.every((id, i) => id === wanted[i])) return setPendingOrder(null)
    const timer = setTimeout(() => setPendingOrder(null), pendingOrder.expires - Date.now())
    return () => clearTimeout(timer)
  }, [tvQueue, pendingOrder])

  const paused = pendingPaused ? pendingPaused.value : tvPaused === true
  useEffect(() => {
    if (!pendingPaused) return
    if (tvPaused === pendingPaused.value) return setPendingPaused(null)
    const timer = setTimeout(() => setPendingPaused(null), pendingPaused.expires - Date.now())
    return () => clearTimeout(timer)
  }, [tvPaused, pendingPaused])

  const sendCommand = useCallback(async (command, successMessage) => {
    if (!connected) {
      roomInputRef.current?.focus()
      showToast(activeRoom ? `⚠ ${roomNotFoundMessage(activeRoom)}` : 'Enter the Room code from the TV first')
      return false
    }
    try {
      await pushCommandToRoom(activeRoom, command)
      if (successMessage) showToast(successMessage)
      return true
    } catch (err) {
      showToast(err.status === 404 ? `⚠ ${roomNotFoundMessage(activeRoom)}` : "⚠ Couldn't reach the TV — please try again")
      return false
    }
  }, [connected, activeRoom, showToast])

  const togglePlayback = async () => {
    const pause = !paused
    setPendingPaused({ value: pause, expires: Date.now() + PENDING_MS })
    if (!(await sendCommand({ type: pause ? 'pause' : 'resume' }))) setPendingPaused(null)
  }

  const nextSong = () =>
    sendCommand({ type: 'skip', currentId: tvCurrent?.id ?? null }, '⏭ Skipping to the next song')

  const playNow = (song) =>
    sendCommand({ type: 'playNow', songId: song.id }, `▶ Playing now: ${song.title}`)

  const confirmRemove = async () => {
    const song = songToRemove
    setSongToRemove(null)
    if (!song) return
    setPendingRemovals((p) => ({ ...p, [song.id]: Date.now() + PENDING_MS }))
    const sent = await sendCommand({ type: 'remove', songId: song.id }, `Removed: ${song.title}`)
    if (!sent) setPendingRemovals(({ [song.id]: _, ...rest }) => rest)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = useCallback(
    async ({ active, over }) => {
      const move = over && planMove(displayQueue, active.id, over.id)
      if (!move) return
      const { reordered, afterId } = move
      setPendingOrder({ ids: reordered.map((s) => s.id), expires: Date.now() + PENDING_MS })
      if (!(await sendCommand({ type: 'move', songId: active.id, afterId }))) setPendingOrder(null)
    },
    [displayQueue, sendCommand]
  )

  const searchInputRef = useRef(null)
  // Empty the field and keep the cursor there, ready to type the next search
  const clearSearch = () => {
    setQuery('')
    searchInputRef.current?.focus()
  }

  const handleSearch = (e) => {
    e.preventDefault()
    if (!query.trim()) return
    search(query.trim())
    setActiveTab('results')
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
        const missing = [!name && 'your name', !room && 'the Room code from the TV'].filter(Boolean)
        showToast(`Enter ${missing.join(' and ')} before adding a song`)
        return
      }

      if (room === activeRoom && roomMissing) {
        roomInputRef.current?.focus()
        showToast(`⚠ ${roomNotFoundMessage(room)}`)
        return
      }

      // The TV owns the queue; the room assigns each request its own id
      const song = { ...result, singerName: name }
      try {
        await pushSongToRoom(room, song, name, { playNext: mode === 'next' })
        showToast(mode === 'next' ? `▶ Playing next: ${song.title}` : `✓ Added to queue: ${song.title}`)
      } catch (err) {
        showToast(err.status === 404
          ? `⚠ ${roomNotFoundMessage(room)}`
          : `⚠ Couldn't add "${song.title}" — please try again`)
      }
    },
    [activeRoom, roomMissing, roomCodeInput, showToast, singerName]
  )

  useEffect(() => {
    document.title = APP_NAME
  }, [])

  // After scanning in, the name is the only thing left to fill in
  useEffect(() => {
    if (roomFromLink && !singerInputRef.current?.value.trim()) singerInputRef.current?.focus()
  }, [roomFromLink])

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="p-4 bg-gray-800 border-b border-gray-700">
        <h1 className="text-xl font-bold text-purple-400 mb-3">{APP_NAME}</h1>

        {/* What the TV is playing, with remote controls */}
        <section
          className="flex items-center gap-3 bg-gray-900/60 border border-gray-700 rounded-xl p-3 mb-4"
          aria-label="Now playing"
          data-testid="now-playing-bar"
        >
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-purple-400 uppercase tracking-widest">Now Playing</p>
            {nowPlaying ? (
              <div data-testid="now-playing">
                <p className="font-semibold text-sm leading-snug line-clamp-2">{nowPlaying.title}</p>
                {nowPlaying.singerName
                  ? <SingerLine song={nowPlaying} />
                  : <p className="text-xs text-gray-400 truncate">{nowPlaying.artist}</p>}
              </div>
            ) : (
              <p className="text-sm text-gray-500" data-testid="nothing-playing">
                {connected ? 'Nothing playing' : 'Join a room to see what’s playing'}
              </p>
            )}
          </div>
          <button
            onClick={togglePlayback}
            disabled={!connected || !nowPlaying}
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed text-lg transition-colors"
            aria-label={paused ? 'Play' : 'Pause'}
            data-testid="mobile-play-pause-btn"
          >
            {paused ? '▶' : '⏸'}
          </button>
          <button
            onClick={nextSong}
            disabled={!connected || (!nowPlaying && displayQueue.length === 0)}
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-lg transition-colors"
            aria-label="Next Song"
            data-testid="mobile-skip-btn"
          >
            ⏭
          </button>
        </section>

        <div className="flex items-center gap-2 mb-1">
          <label htmlFor="singer-name" className={FIELD_LABEL_CLASS}>Your Name</label>
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
            className={`${FIELD_INPUT_CLASS} placeholder:text-sm ${singerError ? INVALID_RING_CLASS : 'focus:ring-purple-500'}`}
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
            aria-invalid={!!shownRoomError}
            aria-describedby={shownRoomError ? 'room-error' : undefined}
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={4}
            className={`${FIELD_INPUT_CLASS} font-mono tracking-widest uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case placeholder:text-xs ${
              shownRoomError ? INVALID_RING_CLASS : 'focus:ring-purple-500'
            }`}
            data-testid="room-code-input"
          />
          <button
            type="submit"
            className="px-2.5 py-2 bg-purple-800 hover:bg-purple-700 rounded-lg font-medium text-sm transition-colors whitespace-nowrap shrink-0"
            data-testid="join-room-btn"
          >
            {activeRoom && !roomMissing ? `✓ ${activeRoom}` : 'Join'}
          </button>
        </form>
        {shownRoomError && (
          <p id="room-error" className={FIELD_ERROR_CLASS} data-testid="room-error">{shownRoomError}</p>
        )}

        <form onSubmit={handleSearch} className="flex items-center gap-2 mt-2">
          <label htmlFor="song-search" className={FIELD_LABEL_CLASS}>Song</label>
          <div className="relative flex-1 min-w-0">
            <input
              id="song-search"
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search song or artist name"
              className={`${FIELD_INPUT_CLASS} w-full placeholder:text-sm focus:ring-purple-500 ${query ? 'pr-9' : ''}`}
              data-testid="search-input"
            />
            {query && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-0.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-white active:bg-gray-600 text-xl leading-none"
                aria-label="Clear search"
                data-testid="clear-search-btn"
              >
                ×
              </button>
            )}
          </div>
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

      <div className="sticky top-0 z-20 bg-gray-900 border-b border-gray-700 flex px-4" role="tablist" aria-label="Songs">
        <TabButton id="results" selected={activeTab === 'results'} onSelect={setActiveTab}>
          Search Results{results.length > 0 ? ` (${results.length})` : ''}
        </TabButton>
        <TabButton id="queue" selected={activeTab === 'queue'} onSelect={setActiveTab}>
          Song Queue{connected && tvQueue ? ` (${displayQueue.length})` : ''}
        </TabButton>
      </div>

      {activeTab === 'results' ? (
        <section className="flex-1 p-4" role="tabpanel" id="panel-results" aria-labelledby="tab-results">
          {results.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8" data-testid="results-empty">
              {loading ? 'Searching…' : 'Search for a song or artist above'}
            </p>
          ) : (
            <>
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
            </>
          )}
        </section>
      ) : (
        <section className="flex-1 p-4" role="tabpanel" id="panel-queue" aria-labelledby="tab-queue">
          {!connected ? (
            <p className="text-gray-500 text-sm text-center py-8" data-testid="queue-empty">
              {roomMissing ? roomNotFoundMessage(activeRoom) : 'Enter the Room code from the TV to see its song queue'}
            </p>
          ) : tvQueue === undefined ? (
            <p className="text-gray-500 text-sm text-center py-8" data-testid="queue-loading">Loading the queue…</p>
          ) : displayQueue.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8" data-testid="queue-empty">
              No songs queued yet — add some from Search Results
            </p>
          ) : (
            <>
              {displayQueue.length > 1 && (
                <p className="text-xs text-gray-500 mb-2">Hold ⠿ and drag to reorder</p>
              )}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={displayQueue.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-2" data-testid="queue-list">
                    {displayQueue.map((song, i) => (
                      <SortableQueueItem
                        key={song.id}
                        song={song}
                        index={i}
                        onPlayNow={playNow}
                        onRemove={setSongToRemove}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            </>
          )}
        </section>
      )}

      {songToRemove && (
        <ConfirmDialog
          title="Remove this song?"
          message={`“${songToRemove.title}”${songToRemove.singerName ? ` (🎤 ${songToRemove.singerName})` : ''} will be taken out of the queue.`}
          confirmLabel="Remove"
          onConfirm={confirmRemove}
          onCancel={() => setSongToRemove(null)}
        />
      )}

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
