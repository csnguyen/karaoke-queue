import { Redis } from '@upstash/redis'
const kv = Redis.fromEnv()

const CODE_RE = /^[A-Z0-9]{4}$/

export default async function handler(req, res) {
  const { code } = req.query
  if (!code || !CODE_RE.test(code)) {
    return res.status(400).json({ error: 'Invalid room code' })
  }
  const meta = await kv.get(`room:${code}:meta`)
  if (!meta) {
    return res.status(404).json({ error: 'Room not found or expired' })
  }
  const raw = await kv.lrange(`room:${code}:songs`, 0, -1)
  const songs = (raw ?? []).map((item) => {
    try { return typeof item === 'string' ? JSON.parse(item) : item } catch { return null }
  }).filter(Boolean)
  res.status(200).json({ songs })
}
