import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
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

  describe('toast confirmations', () => {
    afterEach(() => { searchState.results = [] })

    it('shows a toast when a song is added to the queue', () => {
      searchState.results = [song1]
      renderMobile({ current: null, queue: [], history: [] })
      fireEvent.click(screen.getByRole('button', { name: `Add ${song1.title} to queue` }))
      expect(screen.getByTestId('toast')).toHaveTextContent(`Added to queue: ${song1.title}`)
    })

    it('shows a toast when a song is set to play next', () => {
      searchState.results = [song1]
      renderMobile({ current: null, queue: [], history: [] })
      fireEvent.click(screen.getByRole('button', { name: `Play ${song1.title} next` }))
      expect(screen.getByTestId('toast')).toHaveTextContent(`Playing next: ${song1.title}`)
    })
  })
})
