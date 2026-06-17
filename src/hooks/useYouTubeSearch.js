import { useState, useCallback } from 'react'

// Score a search result by how well it matches an ideal karaoke video:
// embeddable, has on-screen lyrics, and includes a guide vocal.
function scoreKaraokeResult(snippet) {
  const t = (snippet.title ?? '').toLowerCase()
  let score = 0

  // Core karaoke signal
  if (t.includes('karaoke')) score += 10

  // On-screen lyrics (strongly preferred)
  if (t.includes('with lyrics') || t.includes('w/ lyrics') || t.includes('w/lyrics')) score += 8
  if (t.includes('lyrics') && !t.includes('no lyrics')) score += 4

  // Guide vocal / backing vocal present (user wants vocals)
  if (t.includes('guide melody') || t.includes('guide vocal') || t.includes('with guide')) score += 6
  if (t.includes('vocal') && !t.includes('no vocal')) score += 3
  if (t.includes('backing vocal')) score += 3

  // Official releases tend to be higher quality
  if (t.includes('official')) score += 5

  // Penalise vocal-free versions
  if (t.includes('no guide') || t.includes('no vocal') || t.includes('no guide melody')) score -= 8
  if (t.includes('instrumental only') || t.includes('backing track only')) score -= 6
  // "instrumental" alone (without karaoke context) usually means no vocals
  if (t.includes('instrumental') && !t.includes('karaoke')) score -= 4

  return score
}

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
      url.searchParams.set('videoCategoryId', '10')   // Music
      url.searchParams.set('videoEmbeddable', 'true') // Must be playable via iframe API
      url.searchParams.set('maxResults', '20')        // Fetch more so scoring has room to work
      url.searchParams.set('key', apiKey)

      const res = await fetch(url.toString())
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = await res.json()

      const scored = (data.items ?? [])
        .map((item) => ({
          id: item.id.videoId,
          videoId: item.id.videoId,
          title: item.snippet.title,
          artist: item.snippet.channelTitle,
          _score: scoreKaraokeResult(item.snippet),
        }))
        .sort((a, b) => b._score - a._score)
        .slice(0, 8)
        .map(({ _score, ...rest }) => rest)

      setResults(scored)
    } catch (err) {
      setError(err.message ?? 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [apiKeyOverride])

  return { results, loading, error, search }
}
