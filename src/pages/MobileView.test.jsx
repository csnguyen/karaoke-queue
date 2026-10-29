import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
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

  it('skip button is disabled when nothing is queued or playing', () => {
    renderMobile({ current: null, queue: [], history: [] })
    expect(screen.getByTestId('mobile-skip-btn')).toBeDisabled()
  })

  it('skip button is enabled when a song is current', () => {
    renderMobile({ current: song1, queue: [], history: [] })
    expect(screen.getByTestId('mobile-skip-btn')).not.toBeDisabled()
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

  describe('singer name', () => {
    beforeEach(() => { localStorage.clear() })
    afterEach(() => { searchState.results = [] })

    const typeName = (name) =>
      fireEvent.change(screen.getByTestId('singer-input'), { target: { value: name } })

    it('renders a required Singer field with a "Your name" placeholder', () => {
      renderMobile({ current: null, queue: [], history: [] })
      const input = screen.getByLabelText(/Singer/)
      expect(input).toBeRequired()
      expect(input).toHaveAttribute('placeholder', 'Your name')
    })

    it('blocks adding a song until a name is entered', () => {
      searchState.results = [song1]
      renderMobile({ current: null, queue: [], history: [] })
      fireEvent.click(screen.getByRole('button', { name: `Add ${song1.title} to queue` }))
      expect(screen.getByTestId('singer-error')).toBeInTheDocument()
      expect(screen.getByTestId('singer-input')).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByTestId('queue-empty')).toBeInTheDocument()
    })

    it('treats a whitespace-only name as missing', () => {
      searchState.results = [song1]
      renderMobile({ current: null, queue: [], history: [] })
      typeName('   ')
      fireEvent.click(screen.getByRole('button', { name: `Play ${song1.title} next` }))
      expect(screen.getByTestId('queue-empty')).toBeInTheDocument()
    })

    it('attaches the singer name to queued songs', () => {
      searchState.results = [song1]
      renderMobile({ current: null, queue: [], history: [] })
      typeName('  Alex  ')
      fireEvent.click(screen.getByRole('button', { name: `Add ${song1.title} to queue` }))
      expect(screen.getByTestId('queue-list')).toHaveTextContent('🎤 Alex')
      expect(screen.queryByTestId('singer-error')).not.toBeInTheDocument()
    })

    it('remembers the name on this device', () => {
      renderMobile({ current: null, queue: [], history: [] })
      typeName('Alex')
      expect(localStorage.getItem('karaoke-singer-name')).toBe('Alex')
    })

    it('shows a toast when a song is added to the queue', () => {
      searchState.results = [song1]
      renderMobile({ current: null, queue: [], history: [] })
      typeName('Alex')
      fireEvent.click(screen.getByRole('button', { name: `Add ${song1.title} to queue` }))
      expect(screen.getByTestId('toast')).toHaveTextContent(`Added to queue: ${song1.title}`)
    })

    it('shows a toast when a song is set to play next', () => {
      searchState.results = [song1]
      renderMobile({ current: null, queue: [], history: [] })
      typeName('Alex')
      fireEvent.click(screen.getByRole('button', { name: `Play ${song1.title} next` }))
      expect(screen.getByTestId('toast')).toHaveTextContent(`Playing next: ${song1.title}`)
    })
  })
})
