import React, { useEffect, useRef, useState, useCallback } from 'react'

// Space reserved below the video for the controls bar and the first "Up Next" row,
// so the TV never needs scrolling to see what's playing and what's next.
const RESERVED_BELOW_VIDEO = '260px'

export default function KaraokePlayer({ song, onSkip, autoplay = true, externalPaused }) {
  const [playing, setPlaying] = useState(autoplay)
  const playerRef = useRef(null)
  const iframeRef = useRef(null)
  const onSkipRef = useRef(onSkip)
  // Guards against YouTube reporting "ended" more than once for the same video
  const endedForRef = useRef(null)
  useEffect(() => { onSkipRef.current = onSkip }, [onSkip])

  const sendCommand = useCallback((func, args = []) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      '*'
    )
  }, [])

  const togglePlay = useCallback(() => {
    if (playing) {
      sendCommand('pauseVideo')
    } else {
      sendCommand('playVideo')
    }
    setPlaying((p) => !p)
  }, [playing, sendCommand])

  useEffect(() => {
    setPlaying(autoplay)
    endedForRef.current = null
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
  }, [])

  // Auto-advance when YouTube signals the video has ended (playerState === 0)
  useEffect(() => {
    const handleMessage = (e) => {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        const ended =
          (data.event === 'onStateChange' && data.info === 0) ||
          (data.event === 'infoDelivery' && data.info?.playerState === 0)
        if (!ended) return
        const currentId = iframeRef.current?.dataset.songId
        if (endedForRef.current === currentId) return
        endedForRef.current = currentId
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
    width: `min(100%, calc((100vh - ${RESERVED_BELOW_VIDEO}) * 16 / 9))`,
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
      <div style={videoBoxStyle}>
        <iframe
          ref={iframeRef}
          data-testid="youtube-iframe"
          data-song-id={song.id}
          src={src}
          title={`${song.title} by ${song.artist}`}
          allow="autoplay; encrypted-media"
          allowFullScreen
          onLoad={handleIframeLoad}
          className="w-full h-full border-0"
        />
      </div>

      <div className="flex items-center gap-4 px-4 py-3 bg-gray-900">
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
      </div>
    </div>
  )
}
