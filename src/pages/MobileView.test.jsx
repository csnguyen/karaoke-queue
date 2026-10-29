import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import { QueueProvider } from '../context/QueueContext'
import MobileView from './MobileView'

const searchState = vi.hoisted(() => ({ results: [] }))
vi.mock('../hooks/useYouTubeSearch', () => ({
  useYouTubeSearch: () => ({
    results: searchState.results,
    loading: false,
    loadingMore: false,
    error: null,
    search: () => {},
    loadMore: () => {},
    hasMore: false,
  }),
}))

const song1 = { id: '1', title: 'Bohemian Rhapsody', artist: 'Queen', videoId: 'vid1' }
const song2 = { id: '2', title: 'Hotel California', artist: 'Eagles', videoId: 'vid2' }

function renderMobile(initialState) {
  return render(
    <QueueProvider initialStateOverride={initialState}>
      <MobileView />
    </QueueProvider>
  )
}

describe('MobileView', () => {
  it('renders search input and button', () => {
    renderMobile({ current: null, queue: [], history: [] })
    expect(screen.getByTestId('search-input')).toBeInTheDocument()
    expect(screen.getByTestId('search-btn')).toBeInTheDocument()
  })

  it('shows nothing-playing when no current song', () => {
    renderMobile({ current: null, queue: [], history: [] })
    expect(screen.getByTestId('nothing-playing')).toBeInTheDocument()
  })

  it('shows now-playing card when song is current', () => {
    renderMobile({ current: song1, queue: [], history: [] })
    expect(screen.getByTestId('now-playing')).toBeInTheDocument()
    expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument()
  })

  it('shows queue-empty message when queue is empty', () => {
    renderMobile({ current: null, queue: [], history: [] })
    expect(screen.getByTestId('queue-empty')).toBeInTheDocument()
  })

  it('renders queue list when songs are queued', () => {
    renderMobile({ current: null, queue: [song1, song2], history: [] })
    expect(screen.getByTestId('queue-list')).toBeInTheDocument()
    expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument()
    expect(screen.getByText('Hotel California')).toBeInTheDocument()
  })

  it('queue shows correct count', () => {
    renderMobile({ current: null, queue: [song1, song2], history: [] })
    expect(screen.getByText('Queue (2)')).toBeInTheDocument()
  })

  it('remove button removes song from queue', () => {
    renderMobile({ current: null, queue: [song1, song2], history: [] })
    const removeBtn = screen.getByRole('button', { name: `Remove ${song1.title}` })
    fireEvent.click(removeBtn)
    expect(screen.queryByText('Bohemian Rhapsody')).not.toBeInTheDocument()
    expect(screen.getByText('Hotel California')).toBeInTheDocument()
  })

  it('has no Next Song control (TV only)', () => {
    renderMobile({ current: song1, queue: [song2], history: [] })
    expect(screen.queryByTestId('mobile-skip-btn')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next song/i })).not.toBeInTheDocument()
  })

  it('shows the app name and sets the page title', () => {
    renderMobile({ current: null, queue: [], history: [] })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Noe Noraebang')
    expect(document.title).toBe('Noe Noraebang')
  })

  it('search input value updates on change', () => {
    renderMobile({ current: null, queue: [], history: [] })
    const input = screen.getByTestId('search-input')
    fireEvent.change(input, { target: { value: 'Queen' } })
    expect(input.value).toBe('Queen')
  })

  it('has no play/pause control (TV only)', () => {
    renderMobile({ current: song1, queue: [], history: [] })
    expect(screen.queryByTestId('mobile-play-pause-btn')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(play|pause)$/i })).not.toBeInTheDocument()
  })

  it('shows the singer on the Now Playing card', () => {
    renderMobile({ current: { ...song1, singerName: 'Alex' }, queue: [], history: [] })
    expect(screen.getByTestId('now-playing')).toHaveTextContent('🎤 Alex')
  })

  describe('top fields', () => {
    it('labels each field on the left with helper text inside', () => {
      renderMobile({ current: null, queue: [], history: [] })
      expect(screen.getByLabelText('Singer')).toHaveAttribute('placeholder', 'Your Name')
      expect(screen.getByLabelText('Room')).toHaveAttribute('placeholder', 'Room Code (4 letter code on TV)')
      expect(screen.getByLabelText('Song')).toHaveAttribute('placeholder', 'Search song or artist name')
    })

    it('marks Singer and Room as required', () => {
      renderMobile({ current: null, queue: [], history: [] })
      expect(screen.getByLabelText('Singer')).toBeRequired()
      expect(screen.getByLabelText('Room')).toBeRequired()
    })

    it('uppercases the room code and strips other characters', () => {
      renderMobile({ current: null, queue: [], history: [] })
      fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'ab-c1z' } })
      expect(screen.getByLabelText('Room')).toHaveValue('ABC1')
    })
  })

  it('shows Add to Queue on the left and Play Next on the right', () => {
    searchState.results = [song1]
    renderMobile({ current: null, queue: [], history: [] })
    const [first, second] = within(screen.getByTestId('search-results')).getAllByRole('button')
    expect(first).toHaveTextContent('Add to Queue')
    expect(second).toHaveTextContent('Play Next')
    searchState.results = []
  })

  describe('joining from the TV QR code link', () => {
    let fetchSpy
    beforeEach(() => {
      localStorage.clear()
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ songs: [] }) })
    })
    afterEach(() => {
      window.history.replaceState({}, '', '/')
      fetchSpy.mockRestore()
    })

    it('pre-fills and joins the room from ?room=', () => {
      window.history.replaceState({}, '', '/?room=ab12')
      renderMobile({ current: null, queue: [], history: [] })
      expect(screen.getByLabelText('Room')).toHaveValue('AB12')
      expect(screen.getByTestId('join-room-btn')).toHaveTextContent('✓ AB12')
    })

    it('puts the cursor in the Singer field when no name is saved', () => {
      window.history.replaceState({}, '', '/?room=AB12')
      renderMobile({ current: null, queue: [], history: [] })
      expect(screen.getByLabelText('Singer')).toHaveFocus()
    })

    it('leaves focus alone when the name is already remembered', () => {
      localStorage.setItem('karaoke-singer-name', 'Alex')
      window.history.replaceState({}, '', '/?room=AB12')
      renderMobile({ current: null, queue: [], history: [] })
      expect(screen.getByLabelText('Singer')).not.toHaveFocus()
    })

    it('starts polling the linked room', async () => {
      window.history.replaceState({}, '', '/?room=AB12')
      renderMobile({ current: null, queue: [], history: [] })
      await waitFor(() =>
        expect(fetchSpy.mock.calls.some(([url]) => url === '/api/get-room?code=AB12')).toBe(true)
      )
    })

    it('ignores an invalid code in the link', () => {
      window.history.replaceState({}, '', '/?room=AB')
      renderMobile({ current: null, queue: [], history: [] })
      expect(screen.getByLabelText('Room')).toHaveValue('')
      expect(screen.getByTestId('join-room-btn')).toHaveTextContent('Join')
    })
  })

  describe('adding songs', () => {
    let fetchSpy
    beforeEach(() => {
      localStorage.clear()
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ songs: [] }),
      })
    })
    afterEach(() => {
      searchState.results = []
      fetchSpy.mockRestore()
    })

    const typeName = (name) => fireEvent.change(screen.getByLabelText('Singer'), { target: { value: name } })
    const typeRoom = (code) => fireEvent.change(screen.getByLabelText('Room'), { target: { value: code } })
    const addToQueue = () => fireEvent.click(screen.getByRole('button', { name: `Add ${song1.title} to queue` }))
    const playNext = () => fireEvent.click(screen.getByRole('button', { name: `Play ${song1.title} next` }))
    const pushSongCalls = () => fetchSpy.mock.calls.filter(([url]) => url === '/api/push-song')

    function setup() {
      searchState.results = [song1]
      renderMobile({ current: null, queue: [], history: [] })
    }

    it('blocks and asks for both when name and room code are missing', () => {
      setup()
      addToQueue()
      expect(screen.getByTestId('toast')).toHaveTextContent(
        'Enter your Singer name and the Room code from the TV before adding a song'
      )
      expect(screen.getByLabelText('Singer')).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText('Room')).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText('Singer')).toHaveFocus()
      expect(screen.getByTestId('queue-empty')).toBeInTheDocument()
      expect(pushSongCalls()).toHaveLength(0)
    })

    it('blocks Play Next when only the room code is missing', () => {
      setup()
      typeName('Alex')
      playNext()
      expect(screen.getByTestId('toast')).toHaveTextContent(
        'Enter the Room code from the TV before adding a song'
      )
      expect(screen.getByLabelText('Room')).toHaveFocus()
      expect(screen.getByTestId('queue-empty')).toBeInTheDocument()
    })

    it('blocks when only the singer name is missing', () => {
      setup()
      typeRoom('ABCD')
      addToQueue()
      expect(screen.getByTestId('toast')).toHaveTextContent(
        'Enter your Singer name before adding a song'
      )
      expect(screen.getByTestId('queue-empty')).toBeInTheDocument()
    })

    it('treats a whitespace-only name as missing', () => {
      setup()
      typeName('   ')
      typeRoom('ABCD')
      addToQueue()
      expect(screen.getByTestId('toast')).toHaveTextContent('Enter your Singer name')
    })

    it('treats an incomplete room code as missing', () => {
      setup()
      typeName('Alex')
      typeRoom('AB')
      addToQueue()
      expect(screen.getByTestId('toast')).toHaveTextContent('Enter the Room code from the TV')
    })

    it('sends the song with the singer once both are entered (auto-joins a typed code)', async () => {
      setup()
      typeName('  Alex  ')
      typeRoom('abcd')
      addToQueue()
      expect(screen.getByTestId('toast')).toHaveTextContent(`Added to queue: ${song1.title}`)
      expect(screen.getByTestId('join-room-btn')).toHaveTextContent('✓ ABCD')
      await waitFor(() => expect(pushSongCalls()).toHaveLength(1))
      const body = JSON.parse(pushSongCalls()[0][1].body)
      expect(body).toMatchObject({ roomCode: 'ABCD', singerName: 'Alex', playNext: false })
    })

    it('sends Play Next requests flagged so the TV puts them first', async () => {
      setup()
      typeName('Alex')
      typeRoom('ABCD')
      playNext()
      expect(screen.getByTestId('toast')).toHaveTextContent(`Playing next: ${song1.title}`)
      await waitFor(() => expect(pushSongCalls()).toHaveLength(1))
      expect(JSON.parse(pushSongCalls()[0][1].body).playNext).toBe(true)
    })

    it('lets the same singer request the same song twice', async () => {
      setup()
      typeName('Alex')
      typeRoom('ABCD')
      addToQueue()
      addToQueue()
      await waitFor(() => expect(pushSongCalls()).toHaveLength(2))
    })

    it('shows the queue the TV reports, with singers', async () => {
      fetchSpy.mockImplementation(async (url) => ({
        ok: true,
        json: async () => String(url).startsWith('/api/get-room')
          ? { songs: [], tvQueue: [{ ...song1, id: 'req-1', singerName: 'Alex' }] }
          : { ok: true },
      }))
      setup()
      typeName('Alex')
      typeRoom('ABCD')
      addToQueue()
      expect(await screen.findByTestId('queue-list')).toHaveTextContent('🎤 Alex')
    })

    it('remembers the singer name on this device', () => {
      setup()
      typeName('Alex')
      expect(localStorage.getItem('karaoke-singer-name')).toBe('Alex')
    })
  })
})
