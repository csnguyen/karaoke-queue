import { useState, useCallback } from 'react'

// Priority tiers (highest to lowest):
//   1. Official music/lyric video with on-screen lyrics
//   2. Karaoke with guide vocals present
//   3. Karaoke with on-screen lyrics (instrumental backing)
//   4. Plain karaoke / other
//   5. Instrumental / backing track only (no lyrics, no vocals)
function scoreKaraokeResult(snippet) {
  const t = (snippet.title ?? '').toLowerCase()
  let score = 0

  const hasLyrics = t.includes('lyrics') || t.includes('lyric video') || t.includes('with lyrics') || t.includes('w/ lyrics')
  const hasVocals = (t.includes('vocal') && !t.includes('no vocal')) ||
                    t.includes('guide melody') || t.includes('guide vocal') ||
                    t.includes('with guide') || t.includes('backing vocal')
  const isOfficial = t.includes('official')
  const isKaraoke  = t.includes('karaoke')

  // Tier 1 — official music/lyric video with lyrics (best singalong experience)
  if (isOfficial && hasLyrics) score += 40
  else if (isOfficial) score += 20

  // Tier 2 — guide vocals present (sing along with a voice)
  if (hasVocals) score += 30
  if (isKaraoke && hasVocals) score += 5  // karaoke+vocals is better than video+vocals

  // Tier 3 — karaoke with on-screen lyrics
  if (isKaraoke && hasLyrics) score += 20
  else if (hasLyrics) score += 15

  // Tier 4 — plain karaoke
  if (isKaraoke) score += 5

  // Penalise no-vocal / instrumental-only results
  if (t.includes('no guide') || t.includes('no vocal') || t.includes('no guide melody')) score -= 20
  if (t.includes('instrumental only') || t.includes('backing track only')) score -= 15
  if (t.includes('instrumental') && !isKaraoke && !hasLyrics) score -= 10

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
