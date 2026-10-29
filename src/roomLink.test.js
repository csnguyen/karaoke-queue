import { describe, it, expect } from 'vitest'
import { buildJoinUrl, roomCodeFromSearch } from './roomLink'

describe('roomLink', () => {
  it('builds a phone-page URL carrying the room code', () => {
    expect(buildJoinUrl('https://karaoke-queue-seven.vercel.app', 'AB12'))
      .toBe('https://karaoke-queue-seven.vercel.app/?room=AB12')
  })

  it('always links to the phone page, not the TV path', () => {
    expect(buildJoinUrl('http://localhost:5173', 'ABCD')).toBe('http://localhost:5173/?room=ABCD')
  })

  it('reads and normalises a room code from the query string', () => {
    expect(roomCodeFromSearch('?room=ABCD')).toBe('ABCD')
    expect(roomCodeFromSearch('?room=ab12')).toBe('AB12')
    expect(roomCodeFromSearch('?foo=1&room=%20xy-9z%20')).toBe('XY9Z')
  })

  it('ignores missing or invalid codes', () => {
    expect(roomCodeFromSearch('')).toBeNull()
    expect(roomCodeFromSearch('?room=')).toBeNull()
    expect(roomCodeFromSearch('?room=AB')).toBeNull()
    expect(roomCodeFromSearch('?other=ABCD')).toBeNull()
  })
})
