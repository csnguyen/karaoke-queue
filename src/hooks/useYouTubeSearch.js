import { useState, useCallback } from 'react'

// Keyword priority order: karaoke > lyrics > official > vocals
// Goal: karaoke videos with lyrics that ideally use the official version and include vocals.
function scoreKaraokeResult(snippet) {
  const t = (snippet.title ?? '').toLowerCase()
  let score = 0

  // 1+2. Karaoke and lyrics are equal primary signals — both worth 35 points
  if (t.includes('karaoke')) score += 35
  if (t.includes('with lyrics') || t.includes('w/ lyrics') || t.includes('lyric video')) score += 35
  else if (t.includes('lyrics') || t.includes('lyric')) score += 20

  // 3. Official — higher production quality
  if (t.includes('official')) score += 15

  // 4. Vocals / guide melody — someone to sing along with
  if (t.includes('guide melody') || t.includes('guide vocal') || t.includes('with guide')) score += 10
  if (t.includes('vocal') && !t.includes('no vocal')) score += 8
  if (t.includes('backing vocal')) score += 5

  // Penalise explicitly vocal-free / instrumental-only versions
  if (t.includes('no guide') || t.includes('no vocal') || t.includes('no guide melody')) score -= 15
  if (t.includes('instrumental only') || t.includes('backing track only')) score -= 12
  if (t.includes('instrumental') && !t.includes('karaoke') && !t.includes('lyrics')) score -= 8

  return score
}

// Blend karaoke relevance with view/like popularity using log scale so a
// 50M-view video doesn't completely bury a better-quality lower-view one.
function blendScore(karaokeScore, viewCount, likeCount) {
  const popularity = Math.log10(viewCount + 1) * 5 + Math.log10(likeCount + 1) * 3
  return karaokeScore + popularity
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
      // Step 1 — search for candidates
      const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search')
      searchUrl.searchParams.set('part', 'snippet')
      searchUrl.searchParams.set('q', `${query} karaoke`)
      searchUrl.searchParams.set('type', 'video')
      searchUrl.searchParams.set('videoCategoryId', '10')
      searchUrl.searchParams.set('videoEmbeddable', 'true')
      searchUrl.searchParams.set('maxResults', '20')
      searchUrl.searchParams.set('key', apiKey)

      const searchRes = await fetch(searchUrl.toString())
      if (!searchRes.ok) throw new Error(`API error ${searchRes.status}`)
      const searchData = await searchRes.json()
      const items = searchData.items ?? []

      // Step 2 — fetch statistics (views + likes) for all candidate IDs in one call
      const ids = items.map((i) => i.id.videoId).join(',')
      let statsMap = {}
      if (ids) {
        const statsUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
        statsUrl.searchParams.set('part', 'statistics')
        statsUrl.searchParams.set('id', ids)
        statsUrl.searchParams.set('key', apiKey)
        const statsRes = await fetch(statsUrl.toString())
        if (statsRes.ok) {
          const statsData = await statsRes.json()
          for (const v of statsData.items ?? []) {
            statsMap[v.id] = {
              viewCount: parseInt(v.statistics.viewCount ?? '0', 10),
              likeCount: parseInt(v.statistics.likeCount ?? '0', 10),
            }
          }
        }
      }

      // Step 3 — score, sort, trim to top 8
      const scored = items
        .map((item) => {
          const videoId = item.id.videoId
          const stats   = statsMap[videoId] ?? { viewCount: 0, likeCount: 0 }
          const thumbnail = item.snippet.thumbnails?.medium?.url ??
                            item.snippet.thumbnails?.default?.url ?? null
          return {
            id: videoId,
            videoId,
            title: item.snippet.title,
            artist: item.snippet.channelTitle,
            thumbnail,
            viewCount: stats.viewCount,
            likeCount: stats.likeCount,
            _score: blendScore(
              scoreKaraokeResult(item.snippet),
              stats.viewCount,
              stats.likeCount,
            ),
          }
        })
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
