import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useYouTubeSearch } from './useYouTubeSearch'

// Search result item with thumbnail
const fakeItem = (id, title, channel = 'SingChannel') => ({
  id: { videoId: id },
  snippet: {
    title,
    channelTitle: channel,
    thumbnails: { medium: { url: `https://img.youtube.com/vi/${id}/mqdefault.jpg` } },
  },
})

// Statistics item
const fakeStats = (id, viewCount = 0, likeCount = 0) => ({
  id,
  statistics: { viewCount: String(viewCount), likeCount: String(likeCount) },
})

// Mock both the search call and the stats call
function mockBoth(items, statsItems = []) {
  const spy = vi.spyOn(globalThis, 'fetch')
  spy.mockResolvedValueOnce({ ok: true, json: async () => ({ items }) })
  spy.mockResolvedValueOnce({ ok: true, json: async () => ({ items: statsItems }) })
  return spy
}

describe('useYouTubeSearch', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('starts with empty results, not loading, no error', () => {
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    expect(result.current.results).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('result shape includes thumbnail, viewCount, likeCount and omits _score', async () => {
    mockBoth(
      [fakeItem('vid1', 'My Song Karaoke')],
      [fakeStats('vid1', 1000, 50)],
    )
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('My Song') })

    const r = result.current.results[0]
    expect(r.id).toBe('vid1')
    expect(r.videoId).toBe('vid1')
    expect(r.title).toBe('My Song Karaoke')
    expect(r.artist).toBe('SingChannel')
    expect(r.thumbnail).toBe('https://img.youtube.com/vi/vid1/mqdefault.jpg')
    expect(r.viewCount).toBe(1000)
    expect(r.likeCount).toBe(50)
    expect(r).not.toHaveProperty('_score')
  })

  it('appends "lyrics" to the search query', async () => {
    const spy = mockBoth([])
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('Bohemian Rhapsody') })
    expect(spy.mock.calls[0][0]).toContain('Bohemian+Rhapsody+lyrics')
  })

  it('sends videoEmbeddable=true', async () => {
    const spy = mockBoth([])
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('test') })
    expect(spy.mock.calls[0][0]).toContain('videoEmbeddable=true')
  })

  it('restricts to Music category (videoCategoryId=10)', async () => {
    const spy = mockBoth([])
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('test') })
    expect(spy.mock.calls[0][0]).toContain('videoCategoryId=10')
  })

  it('fetches 20 candidates', async () => {
    const spy = mockBoth([])
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('test') })
    expect(spy.mock.calls[0][0]).toContain('maxResults=20')
  })

  it('makes a second fetch for statistics with all video IDs', async () => {
    const spy = mockBoth([fakeItem('v1', 'Song A Karaoke'), fakeItem('v2', 'Song B Karaoke')])
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('Song') })
    const statsCall = spy.mock.calls[1][0]
    expect(statsCall).toContain('youtube/v3/videos')
    expect(statsCall).toContain('statistics')
    expect(statsCall).toContain('v1')
    expect(statsCall).toContain('v2')
  })

  it('higher view/like count lifts a video when karaoke scores are equal', async () => {
    mockBoth(
      [fakeItem('low', 'Song Karaoke'), fakeItem('high', 'Song Karaoke')],
      [fakeStats('low', 1_000, 10), fakeStats('high', 10_000_000, 500_000)],
    )
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('Song') })
    expect(result.current.results[0].videoId).toBe('high')
  })

  it('lyrics beats plain title — lyrics is the top signal', async () => {
    mockBoth(
      [
        fakeItem('plain', 'Song Karaoke'),
        fakeItem('lyr', 'Song with Lyrics'),
      ],
      [fakeStats('plain', 0, 0), fakeStats('lyr', 0, 0)],
    )
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('Song') })
    expect(result.current.results[0].videoId).toBe('lyr')
  })

  it('lyrics+vocals beats lyrics alone', async () => {
    mockBoth(
      [fakeItem('lyr', 'Song with Lyrics'), fakeItem('lyrvoc', 'Song with Lyrics and Vocal')],
      [fakeStats('lyr', 0, 0), fakeStats('lyrvoc', 0, 0)],
    )
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('Song') })
    expect(result.current.results[0].videoId).toBe('lyrvoc')
  })

  it('ranks lyrics+vocals+official video as the top result', async () => {
    mockBoth(
      [
        fakeItem('a', 'Song with Lyrics'),
        fakeItem('b', 'Song with Lyrics and Vocal'),
        fakeItem('c', 'Song Official Music Video with Lyrics and Vocal'),
      ],
      [fakeStats('a', 0, 0), fakeStats('b', 0, 0), fakeStats('c', 0, 0)],
    )
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('Song') })
    expect(result.current.results[0].videoId).toBe('c')
  })

  it('penalises "no guide" and "instrumental only" titles', async () => {
    mockBoth(
      [
        fakeItem('bad',  'Song No Guide Melody Instrumental Only'),
        fakeItem('good', 'Song with Lyrics'),
      ],
      [fakeStats('bad', 0, 0), fakeStats('good', 0, 0)],
    )
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('Song') })
    expect(result.current.results[0].videoId).toBe('good')
  })

  it('returns at most 8 results when 20 candidates are available', async () => {
    const items = Array.from({ length: 20 }, (_, i) => fakeItem(`v${i}`, `Song ${i} Karaoke`))
    const stats = items.map((_, i) => fakeStats(`v${i}`))
    mockBoth(items, stats)
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('Song') })
    expect(result.current.results).toHaveLength(8)
  })

  it('sets error when API key is missing', async () => {
    const { result } = renderHook(() => useYouTubeSearch(undefined))
    await act(async () => { await result.current.search('something') })
    expect(result.current.error).toMatch(/api key/i)
  })

  it('sets error when search fetch returns non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 403 })
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('test') })
    expect(result.current.error).toMatch(/403/)
  })

  it('sets error when fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network down'))
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('test') })
    expect(result.current.error).toBe('Network down')
  })

  it('handles empty items array gracefully', async () => {
    mockBoth([])
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('obscure song') })
    expect(result.current.results).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('clears previous results on new search', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [fakeItem('v1', 'First Karaoke')] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [fakeStats('v1')] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [fakeItem('v2', 'Second Karaoke')] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [fakeStats('v2')] }) })

    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('first') })
    expect(result.current.results).toHaveLength(1)
    await act(async () => { await result.current.search('second') })
    expect(result.current.results).toHaveLength(1)
    expect(result.current.results[0].title).toBe('Second Karaoke')
  })

  it('gracefully continues if stats fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [fakeItem('v1', 'Song Karaoke')] }) })
      .mockResolvedValueOnce({ ok: false, status: 500 })
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('Song') })
    // Search results still returned, just without view/like boost
    expect(result.current.results).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })
})
