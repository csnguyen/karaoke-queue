import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory stand-in for the Upstash client used by the API route
const store = vi.hoisted(() => ({ meta: {}, lists: {} }))
vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: () => ({
      get: async (key) => store.meta[key] ?? null,
      rpush: async (key, value) => { (store.lists[key] ??= []).push(JSON.parse(value)) },
      expire: async () => {},
    }),
  },
}))

const { default: pushSong } = await import('../../api/push-song.js')

function call(body) {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this },
    json(data) { this.body = data; return this },
  }
  return pushSong({ method: 'POST', body }, res).then(() => res)
}

const songData = { id: 'vidX', videoId: 'vidX', title: 'Hotel California', artist: 'Eagles' }
const roomSongs = () => store.lists['room:ROOM:songs'] ?? []

describe('POST /api/push-song', () => {
  beforeEach(() => {
    store.meta = { 'room:ROOM:meta': { created: 1 } }
    store.lists = {}
  })

  it('gives every request its own id, so the same video can be queued twice', async () => {
    await call({ roomCode: 'ROOM', songData, singerName: 'Alex' })
    await call({ roomCode: 'ROOM', songData, singerName: 'Sam' })
    const [first, second] = roomSongs()
    expect(first.videoId).toBe('vidX')
    expect(second.videoId).toBe('vidX')
    expect(first.id).not.toBe(second.id)
    expect(first.id).not.toBe('vidX')
  })

  it('returns the request id', async () => {
    const res = await call({ roomCode: 'ROOM', songData, singerName: 'Alex' })
    expect(res.body).toEqual({ ok: true, id: roomSongs()[0].id })
  })

  it('stores the Play Next flag', async () => {
    await call({ roomCode: 'ROOM', songData, singerName: 'Alex', playNext: true })
    await call({ roomCode: 'ROOM', songData, singerName: 'Alex' })
    expect(roomSongs().map((s) => s.playNext)).toEqual([true, false])
  })

  it('trims and caps the singer name', async () => {
    await call({ roomCode: 'ROOM', songData, singerName: `  ${'A'.repeat(40)}  ` })
    expect(roomSongs()[0].singerName).toBe('A'.repeat(30))
  })

  it('rejects unknown rooms', async () => {
    const res = await call({ roomCode: 'NOPE', songData, singerName: 'Alex' })
    expect(res.statusCode).toBe(404)
    expect(roomSongs()).toEqual([])
  })
})
