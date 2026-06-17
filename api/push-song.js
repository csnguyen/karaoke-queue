import { Redis } from '@upstash/redis'
const kv = Redis.fromEnv()

const CODE_RE = /^[A-Z0-9]{4}$/
const ROOM_TTL = 28800

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { roomCode, songData, singerName } = req.body ?? {}
  if (!roomCode || !CODE_RE.test(roomCode)) {
    return res.status(400).json({ error: 'Invalid room code' })
  }
  if (!songData?.id || !songData?.title) {
    return res.status(400).json({ error: 'Invalid song data — required: id, title' })
  }
  const meta = await kv.get(`room:${roomCode}:meta`)
  if (!meta) {
    return res.status(404).json({ error: 'Room not found or expired' })
  }
  const song = {
    id: songData.id,
    videoId: songData.videoId ?? songData.id,
    title: songData.title,
    artist: songData.artist ?? '',
    singerName: singerName ?? '',
  }
  // rpush is atomic — safe under concurrent requests
  await kv.rpush(`room:${roomCode}:songs`, JSON.stringify(song))
  // Refresh TTL so active rooms don't expire mid-party
  await kv.expire(`room:${roomCode}:meta`, ROOM_TTL)
  res.status(200).json({ ok: true })
}
