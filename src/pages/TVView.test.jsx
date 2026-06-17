import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueueProvider } from '../context/QueueContext'
import TVView from './TVView'

const song1 = { id: '1', title: 'Bohemian Rhapsody', artist: 'Queen', videoId: 'vid1' }
const song2 = { id: '2', title: 'Hotel California', artist: 'Eagles', videoId: 'vid2' }

// Stub fetch so useRoomSync's createRoom + poll don't fail in jsdom
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ code: 'TEST', songs: [] }),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderTV(initialState) {
  return render(
    <QueueProvider initialStateOverride={initialState}>
      <TVView />
    </QueueProvider>
  )
}

describe('TVView', () => {
  it('renders empty player when no song is current', () => {
    renderTV({ current: null, queue: [], history: [] })
    expect(screen.getByTestId('player-empty')).toBeInTheDocument()
  })

  it('renders KaraokePlayer when a song is current', () => {
    renderTV({ current: song1, queue: [], history: [] })
    expect(screen.getByTestId('karaoke-player')).toBeInTheDocument()
    expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument()
  })

  it('shows queue-empty-bar when queue is empty', () => {
    renderTV({ current: null, queue: [], history: [] })
    expect(screen.getByTestId('queue-empty-bar')).toBeInTheDocument()
  })

  it('shows marquee-bar when queue has songs', () => {
    renderTV({ current: song1, queue: [song2], history: [] })
    expect(screen.getByTestId('marquee-bar')).toBeInTheDocument()
  })

  it('marquee contains queued song title and artist', () => {
    renderTV({ current: song1, queue: [song2], history: [] })
    const marquee = screen.getByTestId('queue-marquee')
    expect(marquee.textContent).toContain('Hotel California')
    expect(marquee.textContent).toContain('Eagles')
  })

  it('marquee lists multiple queued songs', () => {
    const song3 = { id: '3', title: 'Yesterday', artist: 'Beatles', videoId: 'vid3' }
    renderTV({ current: song1, queue: [song2, song3], history: [] })
    const marquee = screen.getByTestId('queue-marquee')
    expect(marquee.textContent).toContain('Hotel California')
    expect(marquee.textContent).toContain('Yesterday')
  })
})
