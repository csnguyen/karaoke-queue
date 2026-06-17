import { Redis } from '@upstash/redis'
const kv = Redis.fromEnv()

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const ROOM_TTL = 28800 // 8 hours

function generateCode() {
  return Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const code = generateCode()
  await kv.set(`room:${code}:meta`, JSON.stringify({ created: Date.now() }), { ex: ROOM_TTL })
  res.status(200).json({ code })
}
