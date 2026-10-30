import { randomUUID } from 'node:crypto'
import { Redis } from '@upstash/redis'
import { CODE_RE, touchRoom } from './_room.js'
const kv = Redis.fromEnv()

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { roomCode, songData, singerName, playNext } = req.body ?? {}
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
    // Unique per request, so the same video can be queued again or by another singer
    id: randomUUID(),
    videoId: songData.videoId ?? songData.id,
    title: songData.title,
    artist: songData.artist ?? '',
    singerName: String(singerName ?? '').trim().slice(0, 30),
    playNext: playNext === true,
  }
  // rpush is atomic — safe under concurrent requests
  await kv.rpush(`room:${roomCode}:songs`, JSON.stringify(song))
  // Refresh TTL so active rooms don't expire mid-party
  await touchRoom(kv, roomCode)
  res.status(200).json({ ok: true, id: song.id })
}
