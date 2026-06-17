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
  const [raw, commandRaw, currentRaw] = await Promise.all([
    kv.lrange(`room:${code}:songs`, 0, -1),
    kv.get(`room:${code}:command`),
    kv.get(`room:${code}:current`),
  ])
  const parse = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v } catch { return null } }
  const songs = (raw ?? []).map(parse).filter(Boolean)
  const command = commandRaw ? parse(commandRaw) : null
  const current = currentRaw !== undefined && currentRaw !== null ? parse(currentRaw) : undefined
  res.status(200).json({ songs, command, current })
}
