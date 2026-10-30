import { describe, it, expect } from 'vitest'
import { planCommands, describeRequest } from './activity'

const song = (id, title) => ({ id, videoId: `v-${id}`, title })
const state = (overrides = {}) => ({
  current: song('a', 'Bohemian Rhapsody'),
  queue: [song('b', 'Hotel California'), song('c', 'Yesterday'), song('d', 'Sweet Child')],
  history: [],
  paused: false,
  ...overrides,
})
const text = ({ actor, verb, song: title, suffix }) =>
  [actor, verb, title && `“${title}”`, suffix].filter(Boolean).join(' ')

describe('activity descriptions', () => {
  it('describes song requests, including Play Next', () => {
    expect(text(describeRequest({ title: 'Yesterday', singerName: 'Priya' }))).toBe('Priya added “Yesterday”')
    expect(text(describeRequest({ title: 'Yesterday', singerName: 'Priya', playNext: true })))
      .toBe('Priya added “Yesterday” to play next')
  })

  it('describes each kind of command with who did it and the song', () => {
    const { events } = planCommands(state(), [
      { type: 'pause', by: 'Sam' },
      { type: 'resume', by: 'Sam' },
      { type: 'move', songId: 'd', afterId: null, by: 'Alex' },
      { type: 'move', songId: 'd', afterId: 'c', by: 'Alex' },
      { type: 'remove', songId: 'c', by: 'Kim' },
      { type: 'playNow', songId: 'b', by: 'Jo' },
      { type: 'skip', currentId: 'b', by: 'TV' },
    ])
    expect(events.map(text)).toEqual([
      'Sam paused “Bohemian Rhapsody”',
      'Sam resumed “Bohemian Rhapsody”',
      'Alex moved “Sweet Child” up to #1',
      'Alex moved “Sweet Child” down to #3',
      'Kim removed “Yesterday”',
      'Jo played “Hotel California” now',
      'TV skipped “Hotel California”',
    ])
  })

  it('announces nothing for commands that change nothing', () => {
    const { events, actions } = planCommands(state({ paused: true }), [
      { type: 'pause', by: 'Sam' },                     // already paused
      { type: 'skip', currentId: 'zzz', by: 'Sam' },     // that song already ended
      { type: 'remove', songId: 'gone', by: 'Sam' },     // not in the queue
      { type: 'nonsense', by: 'Sam' },
    ])
    expect(events).toEqual([])
    expect(actions).toHaveLength(3)
  })

  it('uses "Someone" when the phone had no name', () => {
    const { events } = planCommands(state(), [{ type: 'pause' }])
    expect(text(events[0])).toBe('Someone paused “Bohemian Rhapsody”')
    expect(describeRequest({ title: 'Yesterday' }).actor).toBe('Someone')
  })
})
