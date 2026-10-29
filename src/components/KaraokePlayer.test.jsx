import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import KaraokePlayer, { AUTOPLAY_CHECK_MS } from './KaraokePlayer'

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

  it('next song button has accessible aria-label', () => {
    render(<KaraokePlayer song={mockSong} onSkip={() => {}} />)
    expect(screen.getByRole('button', { name: 'Next Song' })).toBeInTheDocument()
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

  it('calls onSkip when infoDelivery reports playerState 0', () => {
    const onSkip = vi.fn()
    render(<KaraokePlayer song={mockSong} onSkip={onSkip} />)
    const iframe = screen.getByTestId('youtube-iframe')
    fireEvent(window, new MessageEvent('message', {
      data: JSON.stringify({ event: 'infoDelivery', info: { playerState: 0 } }),
      source: iframe.contentWindow,
    }))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('only advances once when YouTube reports ended repeatedly for one video', () => {
    const onSkip = vi.fn()
    render(<KaraokePlayer song={mockSong} onSkip={onSkip} />)
    const iframe = screen.getByTestId('youtube-iframe')
    const ended = () => fireEvent(window, new MessageEvent('message', {
      data: JSON.stringify({ event: 'onStateChange', info: 0 }),
      source: iframe.contentWindow,
    }))
    ended()
    ended()
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  describe('with browser-like iframe windows', () => {
    // Real browsers keep one WindowProxy per <iframe> element across src changes;
    // jsdom swaps it, which would hide stale-message bugs. Model the browser.
    let original
    beforeEach(() => {
      original = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')
      const windows = new WeakMap()
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
        configurable: true,
        get() {
          if (!windows.has(this)) windows.set(this, { postMessage: () => {} })
          return windows.get(this)
        },
      })
    })
    afterEach(() => {
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', original)
    })

    const songB = { id: '2', title: 'Hotel California', artist: 'Eagles', videoId: 'vidB' }
    const ended = (source, event = 'onStateChange') => fireEvent(window, new MessageEvent('message', {
      data: JSON.stringify(event === 'onStateChange'
        ? { event, info: 0 }
        : { event, info: { playerState: 0 } }),
      source,
    }))

    it('a late duplicate "ended" from the previous video does not skip the next song', () => {
      // YouTube sends both onStateChange:0 and infoDelivery playerState:0 for one ending.
      // If the parent advances to the next song between them, the second must be ignored.
      const onSkip = vi.fn()
      const { rerender } = render(<KaraokePlayer song={mockSong} onSkip={onSkip} />)
      const firstWindow = screen.getByTestId('youtube-iframe').contentWindow

      ended(firstWindow, 'onStateChange')
      expect(onSkip).toHaveBeenCalledTimes(1)

      rerender(<KaraokePlayer song={songB} onSkip={onSkip} />)
      ended(firstWindow, 'infoDelivery')
      expect(onSkip).toHaveBeenCalledTimes(1)
    })

    it('still advances when the next song itself ends', () => {
      const onSkip = vi.fn()
      const { rerender } = render(<KaraokePlayer song={mockSong} onSkip={onSkip} />)
      ended(screen.getByTestId('youtube-iframe').contentWindow)
      rerender(<KaraokePlayer song={songB} onSkip={onSkip} />)
      ended(screen.getByTestId('youtube-iframe').contentWindow)
      expect(onSkip).toHaveBeenCalledTimes(2)
    })
  })

  describe('when the browser blocks autoplay with sound', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    function loadPlayer(props = {}) {
      const utils = render(<KaraokePlayer song={mockSong} onSkip={() => {}} {...props} />)
      const iframe = screen.getByTestId('youtube-iframe')
      const spy = vi.spyOn(iframe.contentWindow, 'postMessage')
      fireEvent.load(iframe)
      const commands = () => spy.mock.calls.map(([msg]) => JSON.parse(msg).func).filter(Boolean)
      const state = (info) => fireEvent(window, new MessageEvent('message', {
        data: JSON.stringify({ event: 'onStateChange', info }),
        source: iframe.contentWindow,
      }))
      return { ...utils, commands, state }
    }

    it('starts the video muted and offers a sound button if it has not started', () => {
      const { commands } = loadPlayer()
      act(() => { vi.advanceTimersByTime(AUTOPLAY_CHECK_MS) })
      expect(commands()).toEqual(expect.arrayContaining(['mute', 'playVideo']))
      expect(screen.getByTestId('enable-sound-btn')).toHaveTextContent('Click to turn on sound')
    })

    it('clicking the sound button unmutes and keeps playing', () => {
      const { commands } = loadPlayer()
      act(() => { vi.advanceTimersByTime(AUTOPLAY_CHECK_MS) })
      fireEvent.click(screen.getByTestId('enable-sound-btn'))
      expect(commands().slice(-2)).toEqual(['unMute', 'playVideo'])
      expect(screen.queryByTestId('enable-sound-btn')).not.toBeInTheDocument()
    })

    it('does nothing when the video started playing on its own', () => {
      const { commands, state } = loadPlayer()
      state(1)
      act(() => { vi.advanceTimersByTime(AUTOPLAY_CHECK_MS) })
      expect(commands()).not.toContain('mute')
      expect(screen.queryByTestId('enable-sound-btn')).not.toBeInTheDocument()
    })

    it('does nothing when the TV is paused on purpose', () => {
      const { commands } = loadPlayer({ externalPaused: true, onTogglePause: () => {} })
      act(() => { vi.advanceTimersByTime(AUTOPLAY_CHECK_MS) })
      expect(commands()).not.toContain('mute')
      expect(screen.queryByTestId('enable-sound-btn')).not.toBeInTheDocument()
    })
  })

  it('hides the control bar when showControls is false', () => {
    render(<KaraokePlayer song={mockSong} onSkip={() => {}} showControls={false} />)
    expect(screen.getByTestId('youtube-iframe')).toBeInTheDocument()
    expect(screen.queryByTestId('play-pause-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('skip-btn')).not.toBeInTheDocument()
  })

  it('spacebar calls onTogglePause instead of local state when controlled', () => {
    const onTogglePause = vi.fn()
    render(
      <KaraokePlayer song={mockSong} onSkip={() => {}} externalPaused={false} onTogglePause={onTogglePause} />
    )
    fireEvent.keyDown(document.body, { code: 'Space' })
    expect(onTogglePause).toHaveBeenCalledTimes(1)
  })

  it('sends the listening handshake to the iframe on load', () => {
    render(<KaraokePlayer song={mockSong} onSkip={() => {}} />)
    const iframe = screen.getByTestId('youtube-iframe')
    const spy = vi.spyOn(iframe.contentWindow, 'postMessage')
    fireEvent.load(iframe)
    const sent = spy.mock.calls.map(([msg]) => JSON.parse(msg))
    expect(sent).toContainEqual(expect.objectContaining({ event: 'listening' }))
    expect(sent).toContainEqual(expect.objectContaining({ func: 'addEventListener', args: ['onStateChange'] }))
  })
})
