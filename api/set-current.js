import { Redis } from '@upstash/redis'
import { CODE_RE, touchRoom } from './_room.js'
const kv = Redis.fromEnv()

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { roomCode, song, queue } = req.body ?? {}
  if (!roomCode || !CODE_RE.test(roomCode)) {
    return res.status(400).json({ error: 'Invalid room code' })
  }
  const meta = await kv.get(`room:${roomCode}:meta`)
  if (!meta) {
    return res.status(404).json({ error: 'Room not found or expired' })
  }
  await Promise.all([
    kv.set(`room:${roomCode}:current`, JSON.stringify(song ?? null)),
    kv.set(`room:${roomCode}:queue`, JSON.stringify(queue ?? [])),
  ])
  await touchRoom(kv, roomCode)
  res.status(200).json({ ok: true })
}
