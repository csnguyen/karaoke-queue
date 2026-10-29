import React, { useEffect, useRef, useState, useCallback } from 'react'

// Default leaves room below the video for the controls bar and an "Up Next" row.
const DEFAULT_MAX_VIDEO_HEIGHT = 'calc(100vh - 260px)'
// How long to wait for autoplay before assuming the browser blocked it
export const AUTOPLAY_CHECK_MS = 4000
// YouTube player states: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
const STARTED_STATES = new Set([0, 1, 3])

// When onTogglePause is passed, play/pause is controlled by the parent via externalPaused.
export default function KaraokePlayer({
  song,
  onSkip,
  autoplay = true,
  externalPaused,
  onTogglePause,
  showControls = true,
  maxVideoHeight = DEFAULT_MAX_VIDEO_HEIGHT,
}) {
  const [playing, setPlaying] = useState(autoplay)
  const playerRef = useRef(null)
  const iframeRef = useRef(null)
  const onSkipRef = useRef(onSkip)
  // YouTube reports one ending twice (onStateChange + infoDelivery). Each song gets its
  // own iframe (keyed by song id), so remembering which iframe window already ended
  // stops a late duplicate from the previous video skipping the song after it.
  const endedWindowRef = useRef(null)
  useEffect(() => { onSkipRef.current = onSkip }, [onSkip])

  // Browsers block autoplay with sound until someone interacts with the page. When that
  // happens we start the video muted and offer a button; the click also lets later
  // songs autoplay with sound, so it's needed once per TV session at most.
  const [soundBlocked, setSoundBlocked] = useState(false)
  const playerStateRef = useRef(null)
  const autoplayTimerRef = useRef(null)
  const externalPausedRef = useRef(externalPaused)
  useEffect(() => { externalPausedRef.current = externalPaused }, [externalPaused])
  useEffect(() => () => clearTimeout(autoplayTimerRef.current), [])

  const sendCommand = useCallback((func, args = []) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      '*'
    )
  }, [])

  const togglePlay = useCallback(() => {
    if (onTogglePause) {
      onTogglePause()
      return
    }
    if (playing) {
      sendCommand('pauseVideo')
    } else {
      sendCommand('playVideo')
    }
    setPlaying((p) => !p)
  }, [playing, sendCommand, onTogglePause])

  useEffect(() => {
    setPlaying(autoplay)
  }, [song?.id, autoplay])

  // Respond to external play/pause commands (e.g. from mobile remote)
  useEffect(() => {
    if (externalPaused === undefined || externalPaused === null) return
    const shouldPlay = !externalPaused
    sendCommand(shouldPlay ? 'playVideo' : 'pauseVideo')
    setPlaying(shouldPlay)
  }, [externalPaused, sendCommand])

  // The embed only posts state events after the parent sends a "listening"
  // handshake and subscribes to onStateChange.
  const handleIframeLoad = useCallback(() => {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.postMessage(JSON.stringify({ event: 'listening', id: 'karaoke-player', channel: 'widget' }), '*')
    win.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'] }), '*')

    playerStateRef.current = null
    clearTimeout(autoplayTimerRef.current)
    if (!autoplay) return
    autoplayTimerRef.current = setTimeout(() => {
      if (externalPausedRef.current || STARTED_STATES.has(playerStateRef.current)) return
      sendCommand('mute')
      sendCommand('playVideo')
      setSoundBlocked(true)
    }, AUTOPLAY_CHECK_MS)
  }, [autoplay, sendCommand])

  const enableSound = useCallback(() => {
    sendCommand('unMute')
    sendCommand('playVideo')
    setSoundBlocked(false)
  }, [sendCommand])

  // Auto-advance when YouTube signals the video has ended (playerState === 0)
  useEffect(() => {
    const handleMessage = (e) => {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        const state =
          data.event === 'onStateChange' ? data.info
          : data.event === 'infoDelivery' ? data.info?.playerState
          : undefined
        if (typeof state === 'number') playerStateRef.current = state
        if (state !== 0 || endedWindowRef.current === e.source) return
        endedWindowRef.current = e.source
        onSkipRef.current?.()
      } catch {}
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [togglePlay])

  const videoBoxStyle = {
    aspectRatio: '16/9',
    width: `min(100%, calc(${maxVideoHeight} * 16 / 9))`,
    margin: '0 auto',
  }

  if (!song) {
    return (
      <div className="bg-black">
        <div
          className="flex items-center justify-center text-white text-2xl"
          style={videoBoxStyle}
          data-testid="player-empty"
        >
          No song selected
        </div>
      </div>
    )
  }

  const src = `https://www.youtube-nocookie.com/embed/${song.videoId}?enablejsapi=1&autoplay=${autoplay ? 1 : 0}&rel=0`

  return (
    <div ref={playerRef} className="relative w-full bg-black" data-testid="karaoke-player">
      <div className="relative" style={videoBoxStyle}>
        {soundBlocked && (
          <button
            onClick={enableSound}
            className="absolute left-1/2 bottom-[12%] -translate-x-1/2 z-10 px-6 py-3 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-lg font-semibold shadow-xl whitespace-nowrap"
            data-testid="enable-sound-btn"
          >
            🔇 Click to turn on sound
          </button>
        )}
        <iframe
          key={song.id}
          ref={iframeRef}
          data-testid="youtube-iframe"
          src={src}
          title={`${song.title} by ${song.artist}`}
          allow="autoplay; encrypted-media"
          allowFullScreen
          onLoad={handleIframeLoad}
          className="w-full h-full border-0"
        />
      </div>

      {showControls && <div className="flex items-center gap-4 px-4 py-3 bg-gray-900">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-purple-400 uppercase tracking-widest font-semibold">Now Playing</p>
          <p className="text-white font-semibold text-lg truncate">{song.title}</p>
          <p className="text-gray-400 text-sm truncate">{song.artist}</p>
        </div>

        <button
          onClick={togglePlay}
          data-testid="play-pause-btn"
          aria-label={playing ? 'Pause' : 'Play'}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full font-medium transition-colors"
        >
          {playing ? 'Pause' : 'Play'}
        </button>

        <button
          onClick={onSkip}
          data-testid="skip-btn"
          aria-label="Next Song"
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-full font-medium transition-colors whitespace-nowrap"
        >
          Next Song ⏭
        </button>
      </div>}
    </div>
  )
}
