import { Redis } from '@upstash/redis'
import { CODE_CHARS, CODE_RE, ROOM_TTL, roomKey } from './_room.js'
const kv = Redis.fromEnv()

const MAX_ATTEMPTS = 10

function generateCode() {
  return Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
}

// Claims a code only if no live room has it (NX), so rooms are never overwritten
async function claim(code) {
  const ok = await kv.set(roomKey(code, 'meta'), JSON.stringify({ created: Date.now() }), { ex: ROOM_TTL, nx: true })
  return ok === 'OK'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  // A TV whose room expired asks for the same code back, so its QR code and the
  // phones already in the room keep working.
  const requested = req.body?.code
  if (typeof requested === 'string' && CODE_RE.test(requested) && (await claim(requested))) {
    return res.status(200).json({ code: requested })
  }
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateCode()
    if (await claim(code)) return res.status(200).json({ code })
  }
  res.status(503).json({ error: 'Could not create a room, try again' })
}
