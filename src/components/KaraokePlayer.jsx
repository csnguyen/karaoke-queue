import React, { useEffect, useRef, useState, useCallback } from 'react'

export default function KaraokePlayer({ song, onSkip, autoplay = true, externalPaused }) {
  const [playing, setPlaying] = useState(autoplay)
  const playerRef = useRef(null)
  const iframeRef = useRef(null)

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
  }, [song?.id, autoplay])

  // Respond to external play/pause commands (e.g. from mobile remote)
  useEffect(() => {
    if (externalPaused === undefined || externalPaused === null) return
    const shouldPlay = !externalPaused
    sendCommand(shouldPlay ? 'playVideo' : 'pauseVideo')
    setPlaying(shouldPlay)
  }, [externalPaused, sendCommand])

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

  if (!song) {
    return (
      <div
        className="flex items-center justify-center bg-black text-white text-2xl"
        style={{ aspectRatio: '16/9' }}
        data-testid="player-empty"
      >
        No song selected
      </div>
    )
  }

  const src = `https://www.youtube-nocookie.com/embed/${song.videoId}?enablejsapi=1&autoplay=${autoplay ? 1 : 0}&rel=0`

  return (
    <div ref={playerRef} className="relative w-full bg-black" data-testid="karaoke-player">
      <div style={{ aspectRatio: '16/9' }}>
        <iframe
          ref={iframeRef}
          data-testid="youtube-iframe"
          src={src}
          title={`${song.title} by ${song.artist}`}
          allow="autoplay; encrypted-media"
          allowFullScreen
          className="w-full h-full border-0"
        />
      </div>

      <div className="flex items-center gap-4 p-4 bg-gray-900">
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold truncate">{song.title}</p>
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
          aria-label="Skip"
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-full font-medium transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
