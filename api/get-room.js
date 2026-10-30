import { Redis } from '@upstash/redis'
import { CODE_RE, touchRoom } from './_room.js'
const kv = Redis.fromEnv()

export default async function handler(req, res) {
  const { code, touch } = req.query
  if (!code || !CODE_RE.test(code)) {
    return res.status(400).json({ error: 'Invalid room code' })
  }
  const meta = await kv.get(`room:${code}:meta`)
  if (!meta) {
    return res.status(404).json({ error: 'Room not found or expired' })
  }
  // The TV sends touch=1 every few minutes so its room stays alive while it's open
  if (touch === '1') await touchRoom(kv, code)
  const [raw, commandsRaw, currentRaw, queueRaw, pausedRaw] = await Promise.all([
    kv.lrange(`room:${code}:songs`, 0, -1),
    kv.lrange(`room:${code}:commands`, 0, -1),
    kv.get(`room:${code}:current`),
    kv.get(`room:${code}:queue`),
    kv.get(`room:${code}:paused`),
  ])
  const parse = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v } catch { return null } }
  const songs = (raw ?? []).map(parse).filter(Boolean)
  const commands = (commandsRaw ?? []).map(parse).filter(Boolean)
  const current = currentRaw != null ? parse(currentRaw) : undefined
  const tvQueue = queueRaw != null ? (parse(queueRaw) ?? []) : undefined
  const tvPaused = pausedRaw != null ? parse(pausedRaw) === true : undefined
  res.status(200).json({ songs, commands, current, tvQueue, tvPaused })
}
