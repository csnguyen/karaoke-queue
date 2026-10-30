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

  it('shows nothing-playing and disabled controls before joining a room', () => {
    renderMobile({ current: null, queue: [], history: [] })
    expect(screen.getByTestId('nothing-playing')).toHaveTextContent('Join a room')
    expect(screen.getByTestId('mobile-play-pause-btn')).toBeDisabled()
    expect(screen.getByTestId('mobile-skip-btn')).toBeDisabled()
  })

  describe('remote for the TV', () => {
    // A fake room server: get-room reports the TV's state; commands are recorded
    let tv, commands, fetchSpy
    beforeEach(() => {
      tv = { current: null, tvQueue: [], tvPaused: false }
      commands = []
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opts) => {
        if (url === '/api/push-command') {
          commands.push(JSON.parse(opts.body).command)
          return { ok: true, json: async () => ({ ok: true }) }
        }
        return { ok: true, json: async () => ({ songs: [], commands: [], ...tv }) }
      })
      window.history.replaceState({}, '', '/?room=ROOM')
    })
    afterEach(() => {
      fetchSpy.mockRestore()
      window.history.replaceState({}, '', '/')
    })

    const req = (id, title, singerName) => ({ id, videoId: `v-${id}`, title, artist: 'Artist', singerName })
    const openQueueTab = () => fireEvent.click(screen.getByRole('tab', { name: /Song Queue/ }))

    it('sits between the app name and the input fields', async () => {
      renderMobile({ current: null, queue: [], history: [] })
      const bar = screen.getByTestId('now-playing-bar')
      const heading = screen.getByRole('heading', { level: 1 })
      expect(heading.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(bar.compareDocumentPosition(screen.getByLabelText('Your Name')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it("shows the TV's current song and singer", async () => {
      tv.current = req('r1', 'Bohemian Rhapsody', 'Alex')
      renderMobile({ current: null, queue: [], history: [] })
      const card = await screen.findByTestId('now-playing')
      expect(card).toHaveTextContent('Bohemian Rhapsody')
      expect(card).toHaveTextContent('🎤 Alex')
    })

    it('Next sends a skip for the song it saw playing', async () => {
      tv.current = req('r1', 'Bohemian Rhapsody', 'Alex')
      renderMobile({ current: null, queue: [], history: [] })
      await screen.findByTestId('now-playing')
      fireEvent.click(screen.getByRole('button', { name: 'Next Song' }))
      await waitFor(() => expect(commands).toEqual([{ type: 'skip', currentId: 'r1' }]))
    })

    it('play/pause follows the TV and flips straight away when tapped', async () => {
      tv.current = req('r1', 'Bohemian Rhapsody', 'Alex')
      renderMobile({ current: null, queue: [], history: [] })
      await screen.findByTestId('now-playing')
      const button = screen.getByTestId('mobile-play-pause-btn')
      expect(button).toHaveAccessibleName('Pause')
      fireEvent.click(button)
      expect(button).toHaveAccessibleName('Play')
      await waitFor(() => expect(commands).toEqual([{ type: 'pause' }]))
    })

    it('shows Play when the TV is paused, and sends resume', async () => {
      tv.current = req('r1', 'Bohemian Rhapsody', 'Alex')
      tv.tvPaused = true
      renderMobile({ current: null, queue: [], history: [] })
      await waitFor(() => expect(screen.getByTestId('mobile-play-pause-btn')).toHaveAccessibleName('Play'))
      fireEvent.click(screen.getByTestId('mobile-play-pause-btn'))
      await waitFor(() => expect(commands).toEqual([{ type: 'resume' }]))
    })

    it('opens on Search Results, with the Song Queue tab next to it', () => {
      renderMobile({ current: null, queue: [], history: [] })
      const tabs = screen.getAllByRole('tab')
      expect(tabs.map((t) => t.textContent)).toEqual([expect.stringMatching(/^Search Results/), expect.stringMatching(/^Song Queue/)])
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByTestId('results-empty')).toBeInTheDocument()
    })

    it("Song Queue shows the TV's queue with singers and a count", async () => {
      tv.tvQueue = [req('r1', 'Bohemian Rhapsody', 'Alex'), req('r2', 'Hotel California', 'Sam')]
      renderMobile({ current: null, queue: [], history: [] })
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Song Queue (2)' })).toBeInTheDocument())
      openQueueTab()
      const list = screen.getByTestId('queue-list')
      expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
        expect.stringContaining('Bohemian Rhapsody🎤 Alex'),
        expect.stringContaining('Hotel California🎤 Sam'),
      ])
      expect(screen.getByRole('button', { name: 'Drag to reorder Hotel California' })).toBeInTheDocument()
    })

    it('Play on a queued song tells the TV to play it now', async () => {
      tv.tvQueue = [req('r1', 'Bohemian Rhapsody', 'Alex'), req('r2', 'Hotel California', 'Sam')]
      renderMobile({ current: null, queue: [], history: [] })
      openQueueTab()
      fireEvent.click(await screen.findByRole('button', { name: 'Play Hotel California now' }))
      await waitFor(() => expect(commands).toEqual([{ type: 'playNow', songId: 'r2' }]))
      expect(await screen.findByTestId('toast')).toHaveTextContent('Playing now: Hotel California')
    })

    it('says when the queue is empty', async () => {
      renderMobile({ current: null, queue: [], history: [] })
      openQueueTab()
      expect(await screen.findByTestId('queue-empty')).toHaveTextContent('No songs queued yet')
    })

    it('reports when a command could not reach the TV', async () => {
      tv.current = req('r1', 'Bohemian Rhapsody', 'Alex')
      fetchSpy.mockImplementation(async (url) => url === '/api/push-command'
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, json: async () => ({ songs: [], commands: [], ...tv }) })
      renderMobile({ current: null, queue: [], history: [] })
      await screen.findByTestId('now-playing')
      fireEvent.click(screen.getByTestId('mobile-play-pause-btn'))
      expect(await screen.findByTestId('toast')).toHaveTextContent("Couldn't reach the TV")
      // The optimistic flip is undone
      await waitFor(() => expect(screen.getByTestId('mobile-play-pause-btn')).toHaveAccessibleName('Pause'))
    })
  })

  describe('clear search button', () => {
    const searchInput = () => screen.getByLabelText('Song')

    it('is hidden while the search field is empty', () => {
      renderMobile({ current: null, queue: [], history: [] })
      expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
    })

    it('appears once there is text, and clears it and refocuses the field', () => {
      renderMobile({ current: null, queue: [], history: [] })
      fireEvent.change(searchInput(), { target: { value: 'hotel california' } })
      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
      expect(searchInput()).toHaveValue('')
      expect(searchInput()).toHaveFocus()
      expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
    })

    it('does not submit a search', () => {
      renderMobile({ current: null, queue: [], history: [] })
      fireEvent.change(searchInput(), { target: { value: 'queen' } })
      expect(screen.getByRole('button', { name: 'Clear search' })).toHaveAttribute('type', 'button')
    })
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



  describe('top fields', () => {
    it('labels each field on the left with helper text inside', () => {
      renderMobile({ current: null, queue: [], history: [] })
      expect(screen.getByLabelText('Your Name')).toHaveAttribute('placeholder', 'Your Name')
      expect(screen.getByLabelText('Room')).toHaveAttribute('placeholder', 'Room Code (4 letter code on TV)')
      expect(screen.getByLabelText('Song')).toHaveAttribute('placeholder', 'Search song or artist name')
    })

    it('marks Singer and Room as required', () => {
      renderMobile({ current: null, queue: [], history: [] })
      expect(screen.getByLabelText('Your Name')).toBeRequired()
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
      expect(screen.getByLabelText('Your Name')).toHaveFocus()
    })

    it('leaves focus alone when the name is already remembered', () => {
      localStorage.setItem('karaoke-singer-name', 'Alex')
      window.history.replaceState({}, '', '/?room=AB12')
      renderMobile({ current: null, queue: [], history: [] })
      expect(screen.getByLabelText('Your Name')).not.toHaveFocus()
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

    const typeName = (name) => fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: name } })
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
        'Enter your name and the Room code from the TV before adding a song'
      )
      expect(screen.getByLabelText('Your Name')).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText('Room')).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText('Your Name')).toHaveFocus()
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
      expect(pushSongCalls()).toHaveLength(0)
    })

    it('blocks when only the singer name is missing', () => {
      setup()
      typeRoom('ABCD')
      addToQueue()
      expect(screen.getByTestId('toast')).toHaveTextContent(
        'Enter your name before adding a song'
      )
      expect(pushSongCalls()).toHaveLength(0)
    })

    it('treats a whitespace-only name as missing', () => {
      setup()
      typeName('   ')
      typeRoom('ABCD')
      addToQueue()
      expect(screen.getByTestId('toast')).toHaveTextContent('Enter your name')
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
      expect(await screen.findByTestId('toast')).toHaveTextContent(`Added to queue: ${song1.title}`)
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
      expect(await screen.findByTestId('toast')).toHaveTextContent(`Playing next: ${song1.title}`)
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
      fireEvent.click(screen.getByRole('tab', { name: /Song Queue/ }))
      expect(await screen.findByTestId('queue-list')).toHaveTextContent('🎤 Alex')
    })

    it('flags a room code that does not exist as soon as it is joined', async () => {
      fetchSpy.mockImplementation(async (url) => String(url).startsWith('/api/get-room')
        ? { ok: false, status: 404, json: async () => ({ error: 'Room not found or expired' }) }
        : { ok: true, json: async () => ({ ok: true }) })
      setup()
      typeName('Alex')
      typeRoom('1953')
      fireEvent.click(screen.getByTestId('join-room-btn'))
      expect(await screen.findByTestId('room-error')).toHaveTextContent("Room 1953 wasn't found")
      expect(screen.getByTestId('join-room-btn')).toHaveTextContent('Join')
      expect(screen.getByLabelText('Room')).toHaveAttribute('aria-invalid', 'true')

      addToQueue()
      expect(screen.getByTestId('toast')).toHaveTextContent("Room 1953 wasn't found")
      expect(pushSongCalls()).toHaveLength(0)
    })

    it('says the room was not found when the TV rejects a song for that reason', async () => {
      fetchSpy.mockImplementation(async (url) => url === '/api/push-song'
        ? { ok: false, status: 404, json: async () => ({ error: 'Room not found or expired' }) }
        : { ok: true, json: async () => ({ songs: [] }) })
      setup()
      typeName('Alex')
      typeRoom('ABCD')
      addToQueue()
      await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent("Room ABCD wasn't found"))
    })

    it('asks to try again for other failures, and never claims success', async () => {
      fetchSpy.mockImplementation(async (url) => url === '/api/push-song'
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, json: async () => ({ songs: [] }) })
      setup()
      typeName('Alex')
      typeRoom('ABCD')
      addToQueue()
      await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(`Couldn't add "${song1.title}" — please try again`))
      expect(screen.getByTestId('toast')).not.toHaveTextContent('Added to queue')
    })

    it('remembers the singer name on this device', () => {
      setup()
      typeName('Alex')
      expect(localStorage.getItem('karaoke-singer-name')).toBe('Alex')
    })
  })
})
