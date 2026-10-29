import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { QueueProvider } from '../context/QueueContext'
import TVView from './TVView'

const song1 = { id: '1', title: 'Bohemian Rhapsody', artist: 'Queen', videoId: 'vid1' }
const song2 = { id: '2', title: 'Hotel California', artist: 'Eagles', videoId: 'vid2' }
const song3 = { id: '3', title: 'Yesterday', artist: 'Beatles', videoId: 'vid3' }

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

  it('shows tv-queue-list when queue has songs', () => {
    renderTV({ current: song1, queue: [song2], history: [] })
    expect(screen.getByTestId('tv-queue-list')).toBeInTheDocument()
  })

  it('renders all queued songs in the queue panel', () => {
    renderTV({ current: song1, queue: [song2, song3], history: [] })
    expect(screen.getByText('Hotel California')).toBeInTheDocument()
    expect(screen.getByText('Yesterday')).toBeInTheDocument()
  })

  it('each queue item has a Play Now button', () => {
    renderTV({ current: song1, queue: [song2, song3], history: [] })
    expect(screen.getByTestId('tv-play-btn-0')).toBeInTheDocument()
    expect(screen.getByTestId('tv-play-btn-1')).toBeInTheDocument()
  })

  it('clicking Play Now on a queue item makes it the current song', () => {
    renderTV({ current: song1, queue: [song2, song3], history: [] })
    fireEvent.click(screen.getByTestId('tv-play-btn-0'))
    // song2 should now be playing — its title appears in the player controls
    expect(screen.getByText('Hotel California')).toBeInTheDocument()
  })

  it('shows queue count in the panel header', () => {
    renderTV({ current: song1, queue: [song2, song3], history: [] })
    expect(screen.getByText(/Up Next — 2 songs/i)).toBeInTheDocument()
  })

  it('shows the current song in the sidebar Now Playing panel', () => {
    renderTV({ current: song1, queue: [], history: [] })
    expect(screen.getByTestId('tv-now-playing')).toHaveTextContent('Bohemian Rhapsody')
  })

  it('shows the app name and sets the TV page title', () => {
    renderTV({ current: null, queue: [], history: [] })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Noe Noraebang')
    expect(document.title).toBe('Noe Noraebang - TV')
  })

  it('shows the singer name in Now Playing', () => {
    renderTV({ current: { ...song1, singerName: 'Alex' }, queue: [], history: [] })
    expect(screen.getByTestId('tv-now-singer')).toHaveTextContent('Alex')
  })

  it('omits the singer block for songs without a singer', () => {
    renderTV({ current: song1, queue: [], history: [] })
    expect(screen.queryByTestId('tv-now-singer')).not.toBeInTheDocument()
  })

  it('shows each queued song’s singer in the sidebar', () => {
    renderTV({ current: song1, queue: [{ ...song2, singerName: 'Sam' }], history: [] })
    expect(screen.getByTestId('tv-queue-list')).toHaveTextContent('🎤 Sam')
  })

  it('keeps Now Playing out of the sidebar', () => {
    renderTV({ current: song1, queue: [song2], history: [] })
    const sidebar = screen.getByTestId('tv-queue-list').closest('aside')
    expect(sidebar).not.toContainElement(screen.getByTestId('tv-now-playing'))
    expect(sidebar).not.toContainElement(screen.getByTestId('tv-play-pause-btn'))
  })

  it('hides the player built-in control bar in favour of the TV controls', () => {
    renderTV({ current: song1, queue: [], history: [] })
    expect(screen.queryByTestId('play-pause-btn')).not.toBeInTheDocument()
    expect(screen.getByTestId('tv-play-pause-btn')).toBeInTheDocument()
  })

  it('sidebar play/pause button toggles its label', () => {
    renderTV({ current: song1, queue: [], history: [], paused: false })
    const btn = screen.getByTestId('tv-play-pause-btn')
    expect(btn).toHaveAccessibleName('Pause')
    fireEvent.click(btn)
    expect(btn).toHaveAccessibleName('Play')
  })

  it('Next Song button advances to the next queued song', () => {
    renderTV({ current: song1, queue: [song2, song3], history: [] })
    fireEvent.click(screen.getByTestId('tv-next-btn'))
    expect(screen.getByTestId('tv-now-playing')).toHaveTextContent('Hotel California')
    expect(screen.getByText(/Up Next — 1 song$/i)).toBeInTheDocument()
  })

  describe('resizable sidebar', () => {
    // jsdom viewport is 1024px wide → max sidebar = 1024 - 560 = 464
    beforeEach(() => { localStorage.clear() })
    const handle = () => screen.getByRole('separator', { name: 'Resize sidebar' })
    const widthOf = () => Number(handle().getAttribute('aria-valuenow'))
    // jsdom has no PointerEvent; a MouseEvent carries clientX under the pointer event name
    const pointer = (type, clientX) =>
      act(() => { window.dispatchEvent(new MouseEvent(type, { clientX })) })

    it('starts at the default width and exposes it via the CSS variable', () => {
      renderTV({ current: song1, queue: [], history: [] })
      expect(widthOf()).toBe(440)
      expect(screen.getByTestId('tv-view').style.getPropertyValue('--sidebar-w')).toBe('440px')
    })

    it('dragging the handle resizes the sidebar and saves the width', () => {
      renderTV({ current: song1, queue: [], history: [] })
      fireEvent.pointerDown(handle(), { button: 0, clientX: 584 })
      expect(screen.getByTestId('resize-overlay')).toBeInTheDocument()
      pointer('pointermove', 700)
      expect(widthOf()).toBe(324)
      pointer('pointerup', 700)
      expect(screen.queryByTestId('resize-overlay')).not.toBeInTheDocument()
      expect(localStorage.getItem('karaoke-tv-sidebar-width')).toBe('324')
    })

    it('clamps to the minimum and maximum widths', () => {
      renderTV({ current: song1, queue: [], history: [] })
      fireEvent.pointerDown(handle(), { button: 0, clientX: 584 })
      pointer('pointermove', 1020)
      expect(widthOf()).toBe(260)
      pointer('pointermove', 0)
      expect(widthOf()).toBe(464)
      pointer('pointerup', 0)
    })

    it('arrow keys resize (left widens, right narrows)', () => {
      renderTV({ current: song1, queue: [], history: [] })
      fireEvent.keyDown(handle(), { key: 'ArrowRight' })
      expect(widthOf()).toBe(424)
      fireEvent.keyDown(handle(), { key: 'ArrowLeft', shiftKey: true })
      expect(widthOf()).toBe(464)
      fireEvent.keyDown(handle(), { key: 'Home' })
      expect(widthOf()).toBe(260)
    })

    it('double-click resets to the default width', () => {
      renderTV({ current: song1, queue: [], history: [] })
      fireEvent.keyDown(handle(), { key: 'Home' })
      fireEvent.doubleClick(handle())
      expect(widthOf()).toBe(440)
    })

    it('restores the saved width on load', () => {
      localStorage.setItem('karaoke-tv-sidebar-width', '300')
      renderTV({ current: song1, queue: [], history: [] })
      expect(widthOf()).toBe(300)
    })

    it('switches queue rows to a compact layout when narrow', () => {
      renderTV({ current: song1, queue: [song2], history: [] })
      expect(screen.getByTestId('tv-queue-thumb')).toBeInTheDocument()
      fireEvent.keyDown(handle(), { key: 'Home' })
      expect(screen.queryByTestId('tv-queue-thumb')).not.toBeInTheDocument()
      expect(screen.getByTestId('tv-play-btn-0')).toHaveTextContent('▶')
    })
  })

  it('each queue item has a drag handle for reordering', () => {
    renderTV({ current: song1, queue: [song2, song3], history: [] })
    expect(screen.getByRole('button', { name: 'Drag to reorder Hotel California' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drag to reorder Yesterday' })).toBeInTheDocument()
  })
})
