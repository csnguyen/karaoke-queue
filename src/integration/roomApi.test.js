import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory stand-in for the Upstash client used by the API routes
const db = vi.hoisted(() => ({ values: new Map(), ttl: new Map() }))
vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: () => ({
      get: async (key) => {
        const v = db.values.get(key)
        return typeof v === 'string' ? JSON.parse(v) : v ?? null
      },
      set: async (key, value, opts = {}) => {
        if (opts.nx && db.values.has(key)) return null
        db.values.set(key, value)
        if (opts.ex) db.ttl.set(key, opts.ex)
        return 'OK'
      },
      expire: async (key, seconds) => {
        if (!db.values.has(key)) return 0
        db.ttl.set(key, seconds)
        return 1
      },
      lrange: async (key) => db.values.get(key) ?? [],
      rpush: async (key, value) => { db.values.set(key, [...(db.values.get(key) ?? []), value]) },
    }),
  },
}))

const { default: createRoom } = await import('../../api/create-room.js')
const { default: getRoom } = await import('../../api/get-room.js')
const { default: pushCommand } = await import('../../api/push-command.js')
const { CODE_CHARS, ROOM_TTL } = await import('../../api/_room.js')

function call(handler, req) {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this },
    json(data) { this.body = data; return this },
  }
  return handler(req, res).then(() => res)
}

const create = (body = {}) => call(createRoom, { method: 'POST', body })

describe('room API', () => {
  beforeEach(() => {
    db.values.clear()
    db.ttl.clear()
  })

  describe('POST /api/create-room', () => {
    it('never uses characters that are easy to misread (S/5, O/0, I/1/L, Z/2, B/8, G/6)', async () => {
      expect(CODE_CHARS).not.toMatch(/[S5O0I1LZ2B8G6]/)
      for (let i = 0; i < 200; i++) {
        const { body } = await create()
        expect(body.code).toMatch(new RegExp(`^[${CODE_CHARS}]{4}$`))
      }
    })

    it('never overwrites a room that already exists', async () => {
      db.values.set('room:TAKN:meta', JSON.stringify({ created: 1 }))
      const { body } = await create({ code: 'TAKN' })
      expect(body.code).not.toBe('TAKN')
      expect(db.values.get('room:TAKN:meta')).toBe(JSON.stringify({ created: 1 }))
    })

    it('gives a TV its old code back when that room has expired', async () => {
      const { body } = await create({ code: '19S3' })
      expect(body.code).toBe('19S3')
      expect(db.ttl.get('room:19S3:meta')).toBe(ROOM_TTL)
    })

    it('ignores a malformed requested code', async () => {
      const { body } = await create({ code: 'nope!' })
      expect(body.code).toMatch(new RegExp(`^[${CODE_CHARS}]{4}$`))
    })
  })

  describe('GET /api/get-room', () => {
    it('returns 404 for a room that does not exist', async () => {
      const res = await call(getRoom, { query: { code: '1953' } })
      expect(res.statusCode).toBe(404)
    })

    it('keeps every key of the room alive when the TV asks (touch=1)', async () => {
      db.values.set('room:LIVE:meta', JSON.stringify({ created: 1 }))
      db.values.set('room:LIVE:songs', [])
      db.values.set('room:LIVE:queue', '[]')
      await call(getRoom, { query: { code: 'LIVE', touch: '1' } })
      expect(db.ttl.get('room:LIVE:meta')).toBe(ROOM_TTL)
      expect(db.ttl.get('room:LIVE:songs')).toBe(ROOM_TTL)
      expect(db.ttl.get('room:LIVE:queue')).toBe(ROOM_TTL)
    })

    it('does not refresh expiry on ordinary polls', async () => {
      db.values.set('room:LIVE:meta', JSON.stringify({ created: 1 }))
      await call(getRoom, { query: { code: 'LIVE' } })
      expect(db.ttl.has('room:LIVE:meta')).toBe(false)
    })
  })

  describe('POST /api/push-command', () => {
    const send = (command, roomCode = 'LIVE') => call(pushCommand, { method: 'POST', body: { roomCode, command } })
    const stored = () => (db.values.get('room:LIVE:commands') ?? []).map((v) => JSON.parse(v))
    beforeEach(() => { db.values.set('room:LIVE:meta', JSON.stringify({ created: 1 })) })

    it('appends each command so none are lost', async () => {
      await send({ type: 'move', songId: 'r2', afterId: null })
      await send({ type: 'playNow', songId: 'r3' })
      await send({ type: 'skip', currentId: 'r3' })
      await send({ type: 'pause' })
      await send({ type: 'remove', songId: 'r4' })
      expect(stored()).toEqual([
        { type: 'move', songId: 'r2', afterId: null },
        { type: 'playNow', songId: 'r3' },
        { type: 'skip', currentId: 'r3' },
        { type: 'pause' },
        { type: 'remove', songId: 'r4' },
      ])
    })

    it('rejects unknown or malformed commands', async () => {
      for (const bad of [{ type: 'delete' }, { type: 'playNow' }, { type: 'remove' }, { type: 'move', afterId: 'x' }, { type: 'skip', currentId: 7 }, null]) {
        const res = await send(bad)
        expect(res.statusCode).toBe(400)
      }
      expect(stored()).toEqual([])
    })

    it('keeps who sent it, trimmed and capped, and ignores non-text names', async () => {
      await send({ type: 'pause', by: `  ${'S'.repeat(40)}  ` })
      await send({ type: 'resume', by: 42 })
      await send({ type: 'resume', by: '   ' })
      expect(stored()).toEqual([
        { type: 'pause', by: 'S'.repeat(30) },
        { type: 'resume' },
        { type: 'resume' },
      ])
    })

    it('drops extra fields a phone might send', async () => {
      await send({ type: 'pause', songId: 'r1', evil: true })
      expect(stored()).toEqual([{ type: 'pause' }])
    })

    it('returns 404 for a room that does not exist', async () => {
      const res = await send({ type: 'pause' }, 'NONE')
      expect(res.statusCode).toBe(404)
    })
  })
})
