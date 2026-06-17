import { useState, useCallback } from 'react'

export function useYouTubeSearch(apiKeyOverride) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const search = useCallback(async (query) => {
    const apiKey = apiKeyOverride ?? import.meta.env.VITE_YOUTUBE_API_KEY
    if (!apiKey) {
      setError('YouTube API key not configured')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const url = new URL('https://www.googleapis.com/youtube/v3/search')
      url.searchParams.set('part', 'snippet')
      url.searchParams.set('q', `${query} karaoke`)
      url.searchParams.set('type', 'video')
      url.searchParams.set('maxResults', '8')
      url.searchParams.set('key', apiKey)

      const res = await fetch(url.toString())
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = await res.json()

      setResults(
        (data.items ?? []).map((item) => ({
          id: item.id.videoId,
          videoId: item.id.videoId,
          title: item.snippet.title,
          artist: item.snippet.channelTitle,
        }))
      )
    } catch (err) {
      setError(err.message ?? 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [apiKeyOverride])

  return { results, loading, error, search }
}
