import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
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
import { useResizableSidebar } from '../hooks/useResizableSidebar'
import { QRCodeSVG } from 'qrcode.react'
import { APP_NAME } from '../appName'
import { buildJoinUrl } from '../roomLink'

const NOW_PLAYING_BAR_HEIGHT = '112px'
// Below this sidebar width, queue rows drop the thumbnail to keep titles readable
const COMPACT_SIDEBAR_WIDTH = 340
// QR scales with the sidebar so it stays scannable from across the room,
// drawn at 75% of that range to leave more room for the queue
const QR_MIN_SIZE = 140
const QR_MAX_SIZE = 240
const QR_SCALE = 0.75

// Browsers only allow autoplay with sound after someone has clicked or pressed a key
function useHasInteracted() {
  const [hasInteracted, setHasInteracted] = useState(
    () => navigator.userActivation?.hasBeenActive ?? false
  )
  useEffect(() => {
    if (hasInteracted) return
    const onInteract = () => setHasInteracted(true)
    window.addEventListener('pointerdown', onInteract)
    window.addEventListener('keydown', onInteract)
    return () => {
      window.removeEventListener('pointerdown', onInteract)
      window.removeEventListener('keydown', onInteract)
    }
  }, [hasInteracted])
  return hasInteracted
}

function thumbnailFor(song) {
  return song.thumbnail ?? `https://i.ytimg.com/vi/${song.videoId}/mqdefault.jpg`
}

function SortableTVQueueItem({ song, index, onPlayNow, compact }) {
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
      {!compact && (
        <img
          src={thumbnailFor(song)}
          alt=""
          className="w-20 aspect-video object-cover rounded shrink-0 bg-gray-700"
          loading="lazy"
          data-testid="tv-queue-thumb"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium text-sm leading-snug line-clamp-2">{song.title}</p>
        {song.singerName ? (
          <p className="text-purple-300 text-xs font-medium truncate">🎤 {song.singerName}</p>
        ) : (
          <p className="text-gray-400 text-xs truncate">{song.artist}</p>
        )}
      </div>
      <button
        onClick={() => onPlayNow(index)}
        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0"
        aria-label={`Play ${song.title} now`}
        data-testid={`tv-play-btn-${index}`}
      >
        {compact ? '▶' : '▶ Play'}
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
  // Narrowest sidebar that keeps the app name and room code on one line; used as the
  // default and minimum width. Measured from the rendered header, since fonts vary by device.
  const headerRef = useRef(null)
  const [headerFitWidth, setHeaderFitWidth] = useState(null)
  useLayoutEffect(() => {
    const header = headerRef.current
    if (!header) return
    const style = getComputedStyle(header)
    const px = (value) => parseFloat(value) || 0 // 'normal' and '' count as 0
    const content = [...header.children].reduce((sum, el) => sum + el.getBoundingClientRect().width, 0)
    const fit = Math.ceil(
      content +
      px(style.columnGap) * (header.children.length - 1) +
      px(style.paddingLeft) + px(style.paddingRight)
    ) + 2
    if (content > 0) setHeaderFitWidth(fit)
  }, [roomCode])

  const { width: sidebarWidth, dragging: resizing, handleProps } = useResizableSidebar(
    headerFitWidth ? { defaultWidth: headerFitWidth, minWidth: headerFitWidth } : undefined
  )
  const compactQueue = sidebarWidth < COMPACT_SIDEBAR_WIDTH
  const qrSize = Math.round(QR_SCALE * Math.max(QR_MIN_SIZE, Math.min(QR_MAX_SIZE, sidebarWidth - 120)))
  const hasInteracted = useHasInteracted()
  const joinUrl = roomCode ? buildJoinUrl(window.location.origin, roomCode) : null

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
    document.title = `${APP_NAME} - TV`
  }, [])

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
      className={`h-screen bg-black text-white flex flex-col lg:flex-row overflow-hidden ${resizing ? 'select-none cursor-col-resize' : ''}`}
      style={{ '--sidebar-w': `${sidebarWidth}px` }}
      data-testid="tv-view"
    >
      {/* While dragging, cover the page so the YouTube iframe can't swallow pointer events */}
      {resizing && <div className="fixed inset-0 z-50 cursor-col-resize" data-testid="resize-overlay" />}

      {/* Left: player, as large as the column allows, with Now Playing underneath */}
      <main className="flex-1 min-w-0 min-h-0 flex flex-col bg-black">
        <div className="flex-1 min-h-0 flex items-center justify-center">
          {current ? (
            <KaraokePlayer
              song={current}
              onSkip={skip}
              externalPaused={paused}
              onTogglePause={togglePause}
              showControls={false}
              maxVideoHeight={`calc(100vh - ${NOW_PLAYING_BAR_HEIGHT})`}
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
              {!hasInteracted && (
                <p className="mt-6 text-sm text-gray-400" data-testid="interact-hint">
                  Tip: click anywhere on this screen once so songs can start with sound
                </p>
              )}
            </div>
          )}
        </div>

        <section
          className="shrink-0 bg-gray-900 border-t border-gray-800 px-6 flex items-center gap-6"
          style={{ height: NOW_PLAYING_BAR_HEIGHT }}
          aria-label="Now playing"
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs text-purple-400 uppercase tracking-widest font-semibold">Now Playing</p>
            {current ? (
              <div data-testid="tv-now-playing">
                <p className="text-2xl font-semibold leading-tight truncate">{current.title}</p>
                <p className="text-gray-400 text-sm truncate">{current.artist}</p>
              </div>
            ) : (
              <p className="text-gray-600 text-xl">Nothing playing</p>
            )}
          </div>

          {current?.singerName && (
            <div className="shrink-0 max-w-[30%] text-right" data-testid="tv-now-singer">
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Singer</p>
              <p className="text-3xl font-bold text-purple-300 leading-tight truncate">🎤 {current.singerName}</p>
            </div>
          )}

          <div className="flex gap-3 shrink-0">
            <button
              onClick={togglePause}
              disabled={!current}
              className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-full font-medium transition-colors whitespace-nowrap"
              aria-label={paused ? 'Play' : 'Pause'}
              data-testid="tv-play-pause-btn"
            >
              {paused ? '▶ Play' : '⏸ Pause'}
            </button>
            <button
              onClick={skip}
              disabled={!current && queue.length === 0}
              className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-full font-medium transition-colors whitespace-nowrap"
              aria-label="Next Song"
              data-testid="tv-next-btn"
            >
              Next Song ⏭
            </button>
          </div>
        </section>
      </main>

      {/* Drag handle between player and sidebar (side-by-side layout only) */}
      <div
        {...handleProps}
        className={`hidden lg:flex group relative w-2 shrink-0 cursor-col-resize items-center justify-center bg-gray-900 outline-none focus-visible:bg-purple-600 touch-none ${
          resizing ? 'bg-purple-600' : 'hover:bg-purple-700'
        }`}
        title="Drag to resize · double-click to reset"
        data-testid="sidebar-resize-handle"
      >
        <span className={`h-10 w-0.5 rounded-full ${resizing ? 'bg-white' : 'bg-gray-600 group-hover:bg-white'}`} />
      </div>

      {/* Right: app name + room code, join QR, up next */}
      <aside className="w-full lg:w-[var(--sidebar-w)] shrink-0 min-h-0 max-h-[55vh] lg:max-h-none bg-gray-900 border-t lg:border-t-0 border-gray-800 flex flex-col">
        <div
          ref={headerRef}
          className="px-5 pt-4 pb-3 flex items-end justify-between gap-3 shrink-0"
          data-testid="sidebar-header"
        >
          <h1 className="text-lg font-bold text-purple-400 whitespace-nowrap">{APP_NAME}</h1>
          {/* Always rendered (hidden until the room exists) so the width can be measured up front */}
          <div className={`text-right whitespace-nowrap ${roomCode ? '' : 'invisible'}`} data-testid="room-code-badge">
            <p className="text-gray-500 text-[11px] uppercase tracking-widest">Room Code</p>
            <p className="text-purple-300 font-mono text-2xl font-bold tracking-widest leading-none" data-testid="room-code">
              {roomCode ?? 'XXXX'}
            </p>
          </div>
        </div>

        <section className="px-5 pb-4 border-b border-gray-800 flex flex-col items-center shrink-0" aria-label="Join from your phone">
          <p className="text-base font-semibold text-white mb-2">Scan to add songs</p>
          {joinUrl ? (
            <div className="bg-white rounded-lg p-2" data-testid="join-qr" data-join-url={joinUrl}>
              <QRCodeSVG
                value={joinUrl}
                size={qrSize}
                level="M"
                marginSize={1}
                title={`Scan to join room ${roomCode}`}
              />
            </div>
          ) : (
            <div
              className="bg-gray-800 rounded-lg flex items-center justify-center text-center text-xs text-gray-500 px-4"
              style={{ width: qrSize + 16, height: qrSize + 16 }}
              data-testid="join-qr-pending"
            >
              {syncError ? 'Room unavailable — reload to retry' : 'Creating room…'}
            </div>
          )}
        </section>

        <div className="px-5 pt-4 pb-2 flex items-center justify-between shrink-0">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">
            Up Next — {queue.length} song{queue.length !== 1 ? 's' : ''}
          </p>
          {queue.length > 1 && !compactQueue && (
            <span className="text-xs text-gray-600">drag ⠿ to reorder</span>
          )}
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
                  <SortableTVQueueItem key={song.id} song={song} index={i} onPlayNow={skipTo} compact={compactQueue} />
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
