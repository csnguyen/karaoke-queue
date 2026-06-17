import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import KaraokePlayer from './KaraokePlayer'

const mockSong = {
  id: '1',
  title: 'Bohemian Rhapsody',
  artist: 'Queen',
  videoId: 'dQw4w9WgXcQ',
}

describe('KaraokePlayer', () => {
  it('renders empty state when no song provided', () => {
    render(<KaraokePlayer song={null} onSkip={() => {}} />)
    expect(screen.getByTestId('player-empty')).toBeInTheDocument()
    expect(screen.getByText('No song selected')).toBeInTheDocument()
  })

  it('renders player with song info', () => {
    render(<KaraokePlayer song={mockSong} onSkip={() => {}} />)
    expect(screen.getByTestId('karaoke-player')).toBeInTheDocument()
    expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument()
    expect(screen.getByText('Queen')).toBeInTheDocument()
  })

  it('renders iframe with youtube-nocookie URL containing videoId', () => {
    render(<KaraokePlayer song={mockSong} onSkip={() => {}} />)
    const iframe = screen.getByTestId('youtube-iframe')
    expect(iframe.src).toContain('youtube-nocookie.com')
    expect(iframe.src).toContain(mockSong.videoId)
  })

  it('iframe title includes song title and artist', () => {
    render(<KaraokePlayer song={mockSong} onSkip={() => {}} />)
    const iframe = screen.getByTestId('youtube-iframe')
    expect(iframe.title).toContain('Bohemian Rhapsody')
    expect(iframe.title).toContain('Queen')
  })

  it('shows Play button initially when autoplay is false', () => {
    render(<KaraokePlayer song={mockSong} onSkip={() => {}} autoplay={false} />)
    expect(screen.getByTestId('play-pause-btn')).toHaveTextContent('Play')
  })

  it('shows Pause button initially when autoplay is true', () => {
    render(<KaraokePlayer song={mockSong} onSkip={() => {}} autoplay={true} />)
    expect(screen.getByTestId('play-pause-btn')).toHaveTextContent('Pause')
  })

  it('toggles play/pause label when button is clicked', () => {
    render(<KaraokePlayer song={mockSong} onSkip={() => {}} autoplay={false} />)
    const btn = screen.getByTestId('play-pause-btn')
    expect(btn).toHaveTextContent('Play')
    fireEvent.click(btn)
    expect(btn).toHaveTextContent('Pause')
    fireEvent.click(btn)
    expect(btn).toHaveTextContent('Play')
  })

  it('calls onSkip when skip button is clicked', () => {
    const onSkip = vi.fn()
    render(<KaraokePlayer song={mockSong} onSkip={onSkip} />)
    fireEvent.click(screen.getByTestId('skip-btn'))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('spacebar toggles play/pause when body is focused', () => {
    render(<KaraokePlayer song={mockSong} onSkip={() => {}} autoplay={false} />)
    const btn = screen.getByTestId('play-pause-btn')
    expect(btn).toHaveTextContent('Play')
    fireEvent.keyDown(document.body, { code: 'Space' })
    expect(btn).toHaveTextContent('Pause')
    fireEvent.keyDown(document.body, { code: 'Space' })
    expect(btn).toHaveTextContent('Play')
  })

  it('skip button has accessible aria-label', () => {
    render(<KaraokePlayer song={mockSong} onSkip={() => {}} />)
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument()
  })

  it('play-pause button has accessible aria-label reflecting state', () => {
    render(<KaraokePlayer song={mockSong} onSkip={() => {}} autoplay={false} />)
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('play-pause-btn'))
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('iframe src includes autoplay=0 when autoplay is false', () => {
    render(<KaraokePlayer song={mockSong} onSkip={() => {}} autoplay={false} />)
    const iframe = screen.getByTestId('youtube-iframe')
    expect(iframe.src).toContain('autoplay=0')
  })

  it('iframe src includes autoplay=1 when autoplay is true', () => {
    render(<KaraokePlayer song={mockSong} onSkip={() => {}} autoplay={true} />)
    const iframe = screen.getByTestId('youtube-iframe')
    expect(iframe.src).toContain('autoplay=1')
  })

  it('calls onSkip when YouTube sends onStateChange:0 (video ended)', () => {
    const onSkip = vi.fn()
    render(<KaraokePlayer song={mockSong} onSkip={onSkip} />)
    const iframe = screen.getByTestId('youtube-iframe')
    // Simulate the postMessage YouTube sends when the video ends
    fireEvent(window, new MessageEvent('message', {
      data: JSON.stringify({ event: 'onStateChange', info: 0 }),
      source: iframe.contentWindow,
    }))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('does not call onSkip for other YouTube state changes', () => {
    const onSkip = vi.fn()
    render(<KaraokePlayer song={mockSong} onSkip={onSkip} />)
    const iframe = screen.getByTestId('youtube-iframe')
    // state 1 = playing, should not trigger skip
    fireEvent(window, new MessageEvent('message', {
      data: JSON.stringify({ event: 'onStateChange', info: 1 }),
      source: iframe.contentWindow,
    }))
    expect(onSkip).not.toHaveBeenCalled()
  })
})
