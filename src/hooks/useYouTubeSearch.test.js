import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useYouTubeSearch } from './useYouTubeSearch'

const fakeItem = (id, title, channel = 'SingChannel') => ({
  id: { videoId: id },
  snippet: { title, channelTitle: channel },
})

const mockApiResponse = (items) => ({
  ok: true,
  json: async () => ({ items }),
})

describe('useYouTubeSearch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('starts with empty results, not loading, no error', () => {
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    expect(result.current.results).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('maps YouTube API items to song shape without _score field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockApiResponse([fakeItem('vid1', 'My Song Karaoke')])
    )
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('My Song') })

    expect(result.current.results).toEqual([
      { id: 'vid1', videoId: 'vid1', title: 'My Song Karaoke', artist: 'SingChannel' },
    ])
    expect(result.current.results[0]).not.toHaveProperty('_score')
  })

  it('appends "karaoke" to the search query', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockApiResponse([]))
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('Bohemian Rhapsody') })
    expect(spy.mock.calls[0][0]).toContain('Bohemian+Rhapsody+karaoke')
  })

  it('sends videoEmbeddable=true so only iframe-playable results are returned', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockApiResponse([]))
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('test') })
    expect(spy.mock.calls[0][0]).toContain('videoEmbeddable=true')
  })

  it('restricts to Music category (videoCategoryId=10)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockApiResponse([]))
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('test') })
    expect(spy.mock.calls[0][0]).toContain('videoCategoryId=10')
  })

  it('fetches 20 candidates to give scoring room to work', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockApiResponse([]))
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('test') })
    expect(spy.mock.calls[0][0]).toContain('maxResults=20')
  })

  it('sorts "karaoke with lyrics + guide vocal" above "instrumental only"', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockApiResponse([
        fakeItem('bad',  'Song Instrumental Only'),
        fakeItem('good', 'Song Karaoke with Lyrics Guide Melody'),
      ])
    )
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('Song') })
    expect(result.current.results[0].videoId).toBe('good')
  })

  it('penalises "no guide" and "no vocal" titles', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockApiResponse([
        fakeItem('ng', 'Song Karaoke No Guide Melody'),
        fakeItem('wg', 'Song Karaoke with Guide Melody'),
      ])
    )
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('Song') })
    expect(result.current.results[0].videoId).toBe('wg')
  })

  it('returns at most 8 results even when 20 are available', async () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      fakeItem(`v${i}`, `Song ${i} Karaoke`)
    )
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockApiResponse(items))
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('Song') })
    expect(result.current.results).toHaveLength(8)
  })

  it('sets error when API key is missing', async () => {
    const { result } = renderHook(() => useYouTubeSearch(undefined))
    await act(async () => { await result.current.search('something') })
    expect(result.current.error).toMatch(/api key/i)
    expect(result.current.results).toEqual([])
  })

  it('sets error when fetch returns non-ok response', async () => {
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

  it('handles empty items array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockApiResponse([]))
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('obscure song') })
    expect(result.current.results).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('clears previous results on new search', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockApiResponse([fakeItem('v1', 'First Karaoke')]))
      .mockResolvedValueOnce(mockApiResponse([fakeItem('v2', 'Second Karaoke')]))

    const { result } = renderHook(() => useYouTubeSearch('fake-key'))
    await act(async () => { await result.current.search('first') })
    expect(result.current.results).toHaveLength(1)

    await act(async () => { await result.current.search('second') })
    expect(result.current.results).toHaveLength(1)
    expect(result.current.results[0].title).toBe('Second Karaoke')
  })
})
