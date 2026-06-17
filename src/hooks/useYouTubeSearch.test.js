import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useYouTubeSearch } from './useYouTubeSearch'

const fakeItem = (id, title, channel) => ({
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

  it('maps YouTube API items to song shape', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockApiResponse([fakeItem('vid1', 'My Song Karaoke', 'SingChannel')])
    )
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))

    await act(async () => {
      await result.current.search('My Song')
    })

    expect(result.current.results).toEqual([
      { id: 'vid1', videoId: 'vid1', title: 'My Song Karaoke', artist: 'SingChannel' },
    ])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('appends "karaoke" to the search query', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockApiResponse([])
    )
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))

    await act(async () => {
      await result.current.search('Bohemian Rhapsody')
    })

    const calledUrl = fetchSpy.mock.calls[0][0]
    expect(calledUrl).toContain('Bohemian+Rhapsody+karaoke')
  })

  it('sets error when API key is missing', async () => {
    const { result } = renderHook(() => useYouTubeSearch(undefined))

    await act(async () => {
      await result.current.search('something')
    })

    expect(result.current.error).toMatch(/api key/i)
    expect(result.current.results).toEqual([])
  })

  it('sets error when fetch returns non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 403 })
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))

    await act(async () => {
      await result.current.search('test')
    })

    expect(result.current.error).toMatch(/403/)
  })

  it('sets error when fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network down'))
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))

    await act(async () => {
      await result.current.search('test')
    })

    expect(result.current.error).toBe('Network down')
  })

  it('handles empty items array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockApiResponse([]))
    const { result } = renderHook(() => useYouTubeSearch('fake-key'))

    await act(async () => {
      await result.current.search('obscure song')
    })

    expect(result.current.results).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('clears previous results on new search', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockApiResponse([fakeItem('v1', 'First', 'Ch')]))
      .mockResolvedValueOnce(mockApiResponse([fakeItem('v2', 'Second', 'Ch')]))

    const { result } = renderHook(() => useYouTubeSearch('fake-key'))

    await act(async () => { await result.current.search('first') })
    expect(result.current.results).toHaveLength(1)

    await act(async () => { await result.current.search('second') })
    expect(result.current.results).toHaveLength(1)
    expect(result.current.results[0].title).toBe('Second')
  })
})
