// Shared room helpers for the API routes. Files starting with "_" are not deployed as routes.

// Accepts any 4-character code so rooms created with the older alphabet keep working
export const CODE_RE = /^[A-Z0-9]{4}$/
// New codes avoid look-alikes (S/5, O/0, I/1/L, Z/2, B/8, G/6) so a code read off the TV
// can't be typed as a different one
export const CODE_CHARS = 'ACDEFHJKMNPQRTUVWXY3479'
// A room lives this long after its last activity (TV keep-alive, song request or TV update)
export const ROOM_TTL = 28800 // 8 hours

const ROOM_KEYS = ['meta', 'songs', 'current', 'queue', 'command']

export const roomKey = (code, part) => `room:${code}:${part}`

// Restart the expiry clock on every key the room uses, so nothing it holds outlives
// the room and nothing expires while it's still active.
export function touchRoom(kv, code) {
  return Promise.all(ROOM_KEYS.map((part) => kv.expire(roomKey(code, part), ROOM_TTL)))
}
