import { Redis } from '@upstash/redis'
const kv = Redis.fromEnv()

const CODE_RE = /^[A-Z0-9]{4}$/
const VALID_COMMANDS = ['pause', 'resume', 'skip']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { roomCode, command } = req.body ?? {}
  if (!roomCode || !CODE_RE.test(roomCode)) {
    return res.status(400).json({ error: 'Invalid room code' })
  }
  if (!VALID_COMMANDS.includes(command)) {
    return res.status(400).json({ error: 'Invalid command — must be pause, resume, or skip' })
  }
  const meta = await kv.get(`room:${roomCode}:meta`)
  if (!meta) {
    return res.status(404).json({ error: 'Room not found or expired' })
  }
  await kv.set(`room:${roomCode}:command`, JSON.stringify({ type: command, seq: Date.now() }))
  res.status(200).json({ ok: true })
}
