// Links from the TV's QR code to the phone page with the room pre-filled: /?room=ABCD
const ROOM_PARAM = 'room'
const ROOM_CODE_RE = /^[A-Z0-9]{4}$/

export function buildJoinUrl(origin, roomCode) {
  const url = new URL('/', origin)
  url.searchParams.set(ROOM_PARAM, roomCode)
  return url.toString()
}

// Returns a valid 4-character code from a location.search string, or null
export function roomCodeFromSearch(search) {
  const raw = new URLSearchParams(search).get(ROOM_PARAM) ?? ''
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
  return ROOM_CODE_RE.test(code) ? code : null
}
