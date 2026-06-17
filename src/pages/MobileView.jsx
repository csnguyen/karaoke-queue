import React, { useState, useCallback } from 'react'
import { useQueue } from '../context/QueueContext'
import { useYouTubeSearch } from '../hooks/useYouTubeSearch'
import { pushSongToRoom } from '../hooks/useRoomSync'

export default function MobileView() {
  const [query, setQuery] = useState('')
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [activeRoom, setActiveRoom] = useState(null)
  const [roomError, setRoomError] = useState(null)
  const { current, queue, addSong, addNext, removeSong, skip } = useQueue()
  const { results, loading, error, search } = useYouTubeSearch()

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
        try {
          await pushSongToRoom(activeRoom, song)
        } catch {
          // local queue already updated — KV push silently fails rather than block UX
        }
      }
    },
    [activeRoom, addSong, addNext]
  )

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="p-4 bg-gray-800 border-b border-gray-700">
        <h1 className="text-xl font-bold text-purple-400 mb-3">Karaoke Queue</h1>

        {/* Room code join */}
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

        {/* Song search */}
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
              <li key={song.id} className="flex items-center gap-3 bg-gray-800 rounded-lg p-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{song.title}</p>
                  <p className="text-xs text-gray-400 truncate">{song.artist}</p>
                </div>
                <button
                  onClick={() => pushSong(song, 'next')}
                  className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 text-xs rounded-full font-medium transition-colors whitespace-nowrap"
                  aria-label={`Play ${song.title} next`}
                >
                  Play Next
                </button>
                <button
                  onClick={() => pushSong(song, 'queue')}
                  className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-xs rounded-full font-medium transition-colors whitespace-nowrap"
                  aria-label={`Add ${song.title} to queue`}
                >
                  + Queue
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex-1 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Now Playing</h2>
          {current && (
            <button
              onClick={skip}
              className="text-xs text-gray-500 hover:text-white transition-colors"
              data-testid="mobile-skip-btn"
            >
              Skip →
            </button>
          )}
        </div>

        {current ? (
          <div className="bg-purple-900/40 border border-purple-700 rounded-lg p-3 mb-4" data-testid="now-playing">
            <p className="font-semibold text-sm">{current.title}</p>
            <p className="text-xs text-gray-400">{current.artist}</p>
          </div>
        ) : (
          <p className="text-gray-600 text-sm mb-4" data-testid="nothing-playing">Nothing playing</p>
        )}

        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Queue ({queue.length})
        </h2>

        {queue.length === 0 ? (
          <p className="text-gray-600 text-sm" data-testid="queue-empty">Search for songs to add to the queue</p>
        ) : (
          <ul className="space-y-2" data-testid="queue-list">
            {queue.map((song, i) => (
              <li key={song.id} className="flex items-center gap-3 bg-gray-800 rounded-lg p-3">
                <span className="text-gray-500 text-xs w-4 text-center shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{song.title}</p>
                  <p className="text-xs text-gray-400 truncate">{song.artist}</p>
                </div>
                <button
                  onClick={() => removeSong(song.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors text-lg leading-none shrink-0"
                  aria-label={`Remove ${song.title}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
