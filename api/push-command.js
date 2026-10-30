import { Redis } from '@upstash/redis'
import { CODE_RE, roomKey, touchRoom } from './_room.js'
const kv = Redis.fromEnv()

// Song references are request ids; null means "nothing" (e.g. move to the front)
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 64
const optionalId = (v) => (v == null ? null : isId(v) ? v : undefined)

// Each phone command, validated into the shape the TV applies. Returning undefined rejects it.
const COMMANDS = {
  pause: () => ({}),
  resume: () => ({}),
  // currentId is the song the phone saw playing, so a late "next" can't skip the song
  // that started after it ended on its own
  skip: (b) => {
    const currentId = optionalId(b.currentId)
    return currentId === undefined ? undefined : { currentId }
  },
  playNow: (b) => (isId(b.songId) ? { songId: b.songId } : undefined),
  remove: (b) => (isId(b.songId) ? { songId: b.songId } : undefined),
  move: (b) => {
    const afterId = optionalId(b.afterId)
    return isId(b.songId) && afterId !== undefined ? { songId: b.songId, afterId } : undefined
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { roomCode, command } = req.body ?? {}
  if (!roomCode || !CODE_RE.test(roomCode)) {
    return res.status(400).json({ error: 'Invalid room code' })
  }
  const build = COMMANDS[command?.type]
  const fields = build?.(command)
  if (!fields) {
    return res.status(400).json({ error: 'Invalid command' })
  }
  const meta = await kv.get(roomKey(roomCode, 'meta'))
  if (!meta) {
    return res.status(404).json({ error: 'Room not found or expired' })
  }
  // Append-only, so the TV applies every command once and in order
  await kv.rpush(roomKey(roomCode, 'commands'), JSON.stringify({ type: command.type, ...fields }))
  await touchRoom(kv, roomCode)
  res.status(200).json({ ok: true })
}
