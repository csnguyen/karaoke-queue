import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { QueueProvider } from '../context/QueueContext'
import TVView from './TVView'
import { ACTIVITY_TOAST_MS } from '../components/ActivityToasts'

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

  it('Play on a song mid-queue plays it now and keeps every other song in order', () => {
    const song4 = { id: '4', title: 'Sweet Child', artist: "Guns N' Roses", videoId: 'vid4' }
    renderTV({ current: song1, queue: [song2, song3, song4], history: [] })
    fireEvent.click(screen.getByTestId('tv-play-btn-1'))
    expect(screen.getByTestId('tv-now-playing')).toHaveTextContent('Yesterday')
    const queued = [...screen.getByTestId('tv-queue-list').querySelectorAll('li')].map((li) => li.querySelector('p').textContent)
    expect(queued).toEqual(['Hotel California', 'Sweet Child'])
  })

  it('× on a queued song asks first, then removes only that song', () => {
    renderTV({ current: song1, queue: [song2, song3], history: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Hotel California from the queue' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('Hotel California')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('tv-queue-list')).not.toHaveTextContent('Hotel California')
    expect(screen.getByTestId('tv-queue-list')).toHaveTextContent('Yesterday')
  })

  it('Escape or Cancel closes the dialog without removing', () => {
    renderTV({ current: song1, queue: [song2], history: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Hotel California from the queue' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Hotel California from the queue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByTestId('tv-queue-list')).toHaveTextContent('Hotel California')
  })

  it('shows queue count in the panel header', () => {
    renderTV({ current: song1, queue: [song2, song3], history: [] })
    expect(screen.getByText(/Up Next — 2 songs/i)).toBeInTheDocument()
  })

  it('shows the current song in the sidebar Now Playing panel', () => {
    renderTV({ current: song1, queue: [], history: [] })
    expect(screen.getByTestId('tv-now-playing')).toHaveTextContent('Bohemian Rhapsody')
  })

  describe('activity notices', () => {
    const toastTexts = () => screen.queryAllByTestId('activity-toast').map((t) => t.textContent)

    // Serves one poll's worth of requests and commands, then nothing new
    function roomWith({ songs = [], commands = [] }) {
      globalThis.fetch.mockImplementation(async (url) => ({
        ok: true,
        status: 200,
        json: async () => String(url).startsWith('/api/get-room')
          ? { songs, commands }
          : { code: 'TEST', songs: [] },
      }))
    }

    it("shows who added, moved, removed, paused and played songs from their phones", async () => {
      const queued = [
        { id: 'r2', videoId: 'v2', title: 'Hotel California', singerName: 'Sam' },
        { id: 'r3', videoId: 'v3', title: 'Yesterday', singerName: 'Priya' },
      ]
      roomWith({
        songs: [{ id: 'r4', videoId: 'v4', title: 'Sweet Child', singerName: 'Jordan', playNext: true }],
        commands: [
          { type: 'move', songId: 'r3', afterId: 'r4', by: 'Alex' },
          { type: 'remove', songId: 'r2', by: 'Kim' },
          { type: 'pause', by: 'Sam' },
        ],
      })
      renderTV({ current: { ...song1, id: 'r1' }, queue: queued, history: [] })
      await vi.waitFor(() => expect(toastTexts()).toHaveLength(3))
      // At most three at once: the earliest (Jordan's request) has already scrolled off
      expect(toastTexts()).toEqual([
        'Alex moved “Yesterday” up to #2',
        'Kim removed “Hotel California”',
        'Sam paused “Bohemian Rhapsody”',
      ])
      expect(screen.getByTestId('tv-queue-list')).not.toHaveTextContent('Hotel California')
      expect(screen.getByTestId('tv-play-pause-btn')).toHaveAccessibleName('Play')
    })

    it('shows song requests with the singer, including Play Next', async () => {
      roomWith({ songs: [{ id: 'r9', videoId: 'v9', title: 'Yesterday', singerName: 'Priya', playNext: true }] })
      renderTV({ current: song1, queue: [song2], history: [] })
      await vi.waitFor(() => expect(toastTexts()).toEqual(['Priya added “Yesterday” to play next']))
    })

    it("labels the TV's own controls as TV", () => {
      renderTV({ current: song1, queue: [song2, song3], history: [], paused: false })
      fireEvent.click(screen.getByTestId('tv-play-pause-btn'))
      fireEvent.click(screen.getByTestId('tv-play-btn-1'))
      fireEvent.click(screen.getByRole('button', { name: 'Remove Hotel California from the queue' }))
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }))
      expect(toastTexts()).toEqual([
        'TV paused “Bohemian Rhapsody”',
        'TV played “Yesterday” now',
        'TV removed “Hotel California”',
      ])
    })

    it('stays quiet when a song simply finishes', () => {
      renderTV({ current: song1, queue: [song2], history: [] })
      const iframe = screen.getByTestId('youtube-iframe')
      fireEvent(window, new MessageEvent('message', {
        data: JSON.stringify({ event: 'onStateChange', info: 0 }),
        source: iframe.contentWindow,
      }))
      expect(screen.getByTestId('tv-now-playing')).toHaveTextContent('Hotel California')
      expect(toastTexts()).toEqual([])
    })

    it('keeps each notice on screen for 7 seconds', () => {
      vi.useFakeTimers()
      try {
        renderTV({ current: song1, queue: [song2], history: [] })
        fireEvent.click(screen.getByTestId('tv-play-pause-btn'))
        expect(ACTIVITY_TOAST_MS).toBe(7000)
        act(() => { vi.advanceTimersByTime(6999) })
        expect(toastTexts()).toHaveLength(1)
        act(() => { vi.advanceTimersByTime(1) })
        expect(toastTexts()).toEqual([])
      } finally {
        vi.useRealTimers()
      }
    })

    it('sits at the bottom of the sidebar', () => {
      renderTV({ current: song1, queue: [song2], history: [] })
      const toasts = screen.getByTestId('activity-toasts')
      expect(toasts.closest('aside')).not.toBeNull()
      expect(toasts).toHaveClass('bottom-3')
    })
  })

  describe('when nothing is playing', () => {
    it('starts the first song a phone adds to the room straight away', async () => {
      globalThis.fetch.mockImplementation(async (url) => ({
        ok: true,
        status: 200,
        json: async () =>
          String(url).startsWith('/api/get-room')
            ? { songs: [{ ...song1, singerName: 'Alex' }] }
            : { code: 'TEST', songs: [] },
      }))
      renderTV({ current: null, queue: [], history: [] })
      expect(screen.getByTestId('player-empty')).toBeInTheDocument()
      expect(await screen.findByTestId('tv-now-playing')).toHaveTextContent('Bohemian Rhapsody')
      expect(screen.getByTestId('karaoke-player')).toBeInTheDocument()
      expect(screen.getByText(/Up Next — 0 songs/i)).toBeInTheDocument()
    })

    it('shows a one-time tip to click the screen so songs can play with sound', () => {
      renderTV({ current: null, queue: [], history: [] })
      expect(screen.getByTestId('interact-hint')).toBeInTheDocument()
      fireEvent.pointerDown(document.body)
      expect(screen.queryByTestId('interact-hint')).not.toBeInTheDocument()
    })
  })

  describe('join QR code', () => {
    it('shows "Scan to add songs" above a QR code for the phone page with this room', async () => {
      renderTV({ current: null, queue: [], history: [] })
      const qr = await screen.findByTestId('join-qr')
      expect(qr).toHaveAttribute('data-join-url', `${window.location.origin}/?room=TEST`)
      expect(qr.querySelector('svg')).toBeInTheDocument()
      const helpText = screen.getByText('Scan to add songs')
      expect(helpText.compareDocumentPosition(qr) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('sits below the app name and room code', async () => {
      renderTV({ current: song1, queue: [song2], history: [] })
      const qr = await screen.findByTestId('join-qr')
      const header = screen.getByTestId('sidebar-header')
      const sidebar = screen.getByTestId('tv-queue-list').closest('aside')
      expect(sidebar.firstElementChild).toBe(header)
      expect(header.compareDocumentPosition(qr) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(qr.compareDocumentPosition(screen.getByTestId('tv-queue-list')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('is drawn at 75% of the previous size', async () => {
      // jsdom fallback width 260 → previous size max(140, 260 - 120) = 140 → 75% = 105
      renderTV({ current: song1, queue: [], history: [] })
      const svg = (await screen.findByTestId('join-qr')).querySelector('svg')
      expect(svg).toHaveAttribute('width', '105')
    })

    it('fills the empty video area with the QR code and steps when nothing is playing', async () => {
      renderTV({ current: null, queue: [], history: [] })
      const empty = screen.getByTestId('player-empty')
      const qr = await screen.findByTestId('join-qr')
      expect(empty).toContainElement(qr)
      expect(empty).toHaveTextContent('Scan to add songs')
      expect(screen.getByTestId('join-steps')).toHaveTextContent(/Scan the code.*Enter your name.*Search for a song/)
      // No address or room code to read and mistype (ignoring the QR's hidden SVG title)
      const visible = empty.cloneNode(true)
      visible.querySelector('[data-testid=join-qr]').remove()
      expect(visible.textContent).not.toContain(window.location.host)
      expect(visible.textContent).not.toContain('TEST')
      expect(screen.getAllByTestId('join-qr')).toHaveLength(1)
    })

    it('moves the QR code back to the sidebar once a song is playing', async () => {
      renderTV({ current: song1, queue: [], history: [] })
      const qr = await screen.findByTestId('join-qr')
      expect(qr.closest('aside')).not.toBeNull()
      expect(screen.queryByTestId('player-empty')).not.toBeInTheDocument()
    })

    it('always encodes the room code the TV is showing', async () => {
      renderTV({ current: song1, queue: [], history: [] })
      const qr = await screen.findByTestId('join-qr')
      const shownCode = screen.getByTestId('room-code').textContent
      expect(new URL(qr.dataset.joinUrl).searchParams.get('room')).toBe(shownCode)
    })

    it('keeps pointing at a working room with the same code if the room expires', async () => {
      // The room exists, then disappears on the server (e.g. hours with no songs).
      let roomAlive = true
      const createBodies = []
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (url === '/api/create-room') {
          const body = JSON.parse(opts?.body ?? '{}')
          createBodies.push(body)
          roomAlive = true
          return { ok: true, status: 200, json: async () => ({ code: body.code ?? '19S3' }) }
        }
        if (String(url).startsWith('/api/get-room') && !roomAlive) {
          return { ok: false, status: 404, json: async () => ({ error: 'Room not found or expired' }) }
        }
        return { ok: true, status: 200, json: async () => ({ songs: [] }) }
      })
      renderTV({ current: song1, queue: [], history: [] })
      const qr = await screen.findByTestId('join-qr')
      expect(qr.dataset.joinUrl).toMatch(/\?room=19S3$/)

      roomAlive = false
      await vi.waitFor(() => expect(createBodies).toContainEqual({ code: '19S3' }), { timeout: 4000 })
      expect(screen.getByTestId('join-qr').dataset.joinUrl).toMatch(/\?room=19S3$/)
      expect(screen.getByTestId('room-code')).toHaveTextContent('19S3')
    })

    it('shows a placeholder until the room exists', () => {
      renderTV({ current: null, queue: [], history: [] })
      expect(screen.getByTestId('join-qr-pending')).toHaveTextContent('Creating room')
      expect(screen.queryByTestId('join-qr')).not.toBeInTheDocument()
    })
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

  it('play/pause and next show only icons, like the phone', () => {
    renderTV({ current: song1, queue: [song2], history: [], paused: false })
    expect(screen.getByTestId('tv-play-pause-btn').textContent).toBe('⏸')
    expect(screen.getByTestId('tv-next-btn').textContent).toBe('⏭')
    fireEvent.click(screen.getByTestId('tv-play-pause-btn'))
    expect(screen.getByTestId('tv-play-pause-btn').textContent).toBe('▶')
    // Still named for screen readers and hover tooltips
    expect(screen.getByTestId('tv-play-pause-btn')).toHaveAttribute('title', 'Play')
    expect(screen.getByTestId('tv-next-btn')).toHaveAccessibleName('Next Song')
  })

  it('Next Song button advances to the next queued song', () => {
    renderTV({ current: song1, queue: [song2, song3], history: [] })
    fireEvent.click(screen.getByTestId('tv-next-btn'))
    expect(screen.getByTestId('tv-now-playing')).toHaveTextContent('Hotel California')
    expect(screen.getByText(/Up Next — 1 song$/i)).toBeInTheDocument()
  })

  describe('resizable sidebar', () => {
    // jsdom viewport is 1024px wide → max sidebar = 1024 - 560 = 464.
    // jsdom has no layout, so header widths are stubbed: app name 130 + room code 100,
    // no padding/gap from Tailwind in jsdom, +2px rounding margin → fits at 232.
    const HEADER_FIT = 232
    const STORAGE_KEY = 'karaoke-tv-sidebar-width-v2'
    let rectSpy
    beforeEach(() => {
      localStorage.clear()
      const original = Element.prototype.getBoundingClientRect
      rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
        if (this.parentElement?.dataset.testid === 'sidebar-header') {
          const width = this.tagName === 'H1' ? 130 : 100
          return { width, height: 30, top: 0, left: 0, right: width, bottom: 30, x: 0, y: 0 }
        }
        return original.call(this)
      })
    })
    afterEach(() => rectSpy.mockRestore())

    const handle = () => screen.getByRole('separator', { name: 'Resize sidebar' })
    const widthOf = () => Number(handle().getAttribute('aria-valuenow'))
    // jsdom has no PointerEvent; a MouseEvent carries clientX under the pointer event name
    const pointer = (type, clientX) =>
      act(() => { window.dispatchEvent(new MouseEvent(type, { clientX })) })

    it('defaults to the narrowest width that fits the app name and room code on one line', () => {
      renderTV({ current: song1, queue: [], history: [] })
      expect(widthOf()).toBe(HEADER_FIT)
      expect(screen.getByTestId('tv-view').style.getPropertyValue('--sidebar-w')).toBe(`${HEADER_FIT}px`)
      expect(screen.getByRole('heading', { level: 1 })).toHaveClass('whitespace-nowrap')
    })

    it('falls back to 260px when the header cannot be measured', () => {
      rectSpy.mockRestore()
      renderTV({ current: song1, queue: [], history: [] })
      expect(widthOf()).toBe(260)
    })

    it('ignores widths saved before the new default', () => {
      localStorage.setItem('karaoke-tv-sidebar-width', '440')
      renderTV({ current: song1, queue: [], history: [] })
      expect(widthOf()).toBe(HEADER_FIT)
    })

    it('dragging the handle resizes the sidebar and saves the width', () => {
      renderTV({ current: song1, queue: [], history: [] })
      fireEvent.pointerDown(handle(), { button: 0, clientX: 790 })
      expect(screen.getByTestId('resize-overlay')).toBeInTheDocument()
      pointer('pointermove', 700)
      expect(widthOf()).toBe(324)
      pointer('pointerup', 700)
      expect(screen.queryByTestId('resize-overlay')).not.toBeInTheDocument()
      expect(localStorage.getItem(STORAGE_KEY)).toBe('324')
    })

    it('cannot be dragged narrower than the header fit, or past the maximum', () => {
      renderTV({ current: song1, queue: [], history: [] })
      fireEvent.pointerDown(handle(), { button: 0, clientX: 790 })
      pointer('pointermove', 1020)
      expect(widthOf()).toBe(HEADER_FIT)
      pointer('pointermove', 0)
      expect(widthOf()).toBe(464)
      pointer('pointerup', 0)
    })

    it('arrow keys resize (left widens, right narrows); Home/End jump to the limits', () => {
      renderTV({ current: song1, queue: [], history: [] })
      fireEvent.keyDown(handle(), { key: 'ArrowLeft' })
      expect(widthOf()).toBe(HEADER_FIT + 16)
      fireEvent.keyDown(handle(), { key: 'ArrowLeft', shiftKey: true })
      expect(widthOf()).toBe(HEADER_FIT + 80)
      fireEvent.keyDown(handle(), { key: 'ArrowRight' })
      expect(widthOf()).toBe(HEADER_FIT + 64)
      fireEvent.keyDown(handle(), { key: 'End' })
      expect(widthOf()).toBe(464)
      fireEvent.keyDown(handle(), { key: 'Home' })
      expect(widthOf()).toBe(HEADER_FIT)
    })

    it('double-click resets to the default width and forgets the saved one', () => {
      renderTV({ current: song1, queue: [], history: [] })
      fireEvent.keyDown(handle(), { key: 'End' })
      fireEvent.doubleClick(handle())
      expect(widthOf()).toBe(HEADER_FIT)
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('restores the saved width on load', () => {
      localStorage.setItem(STORAGE_KEY, '300')
      renderTV({ current: song1, queue: [], history: [] })
      expect(widthOf()).toBe(300)
    })

    it('uses the compact queue layout when narrow and thumbnails when wide', () => {
      renderTV({ current: song1, queue: [song2], history: [] })
      expect(screen.queryByTestId('tv-queue-thumb')).not.toBeInTheDocument()
      expect(screen.getByTestId('tv-play-btn-0')).toHaveTextContent('▶')
      fireEvent.keyDown(handle(), { key: 'End' })
      expect(screen.getByTestId('tv-queue-thumb')).toBeInTheDocument()
    })
  })

  it('each queue item has a drag handle for reordering', () => {
    renderTV({ current: song1, queue: [song2, song3], history: [] })
    expect(screen.getByRole('button', { name: 'Drag to reorder Hotel California' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drag to reorder Yesterday' })).toBeInTheDocument()
  })
})
