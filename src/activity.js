import { reducer } from './context/QueueContext'

// Name shown when a phone hasn't filled in "Your Name"
const UNKNOWN_ACTOR = 'Someone'

// Queue action for a remote (or TV) command, or null for an unknown command
export function commandToAction(command) {
  switch (command.type) {
    case 'pause': return { type: 'SET_PAUSED', paused: true }
    case 'resume': return { type: 'SET_PAUSED', paused: false }
    case 'skip': return { type: 'SKIP_IF_CURRENT', currentId: command.currentId ?? null }
    case 'playNow': return { type: 'PLAY_SONG_NOW', id: command.songId }
    case 'move': return { type: 'MOVE_SONG', id: command.songId, afterId: command.afterId ?? null }
    case 'remove': return { type: 'REMOVE_SONG', id: command.songId }
    default: return null
  }
}

const titleOf = (state, id) =>
  (state.current?.id === id ? state.current : state.queue.find((s) => s.id === id))?.title

// What a command did, as { actor, verb, song?, suffix? }. Called with the queue state
// before and after it was applied; returns null when it changed nothing (e.g. "pause"
// while already paused, or a stale "next"), so nothing is announced.
export function describeCommand(actor, command, before, after) {
  if (after === before) return null
  const who = actor || UNKNOWN_ACTOR
  switch (command.type) {
    case 'pause': return { actor: who, verb: 'paused', song: before.current?.title }
    case 'resume': return { actor: who, verb: 'resumed', song: before.current?.title }
    case 'skip': return { actor: who, verb: 'skipped', song: before.current?.title }
    case 'playNow': return { actor: who, verb: 'played', song: titleOf(before, command.songId), suffix: 'now' }
    case 'remove': return { actor: who, verb: 'removed', song: titleOf(before, command.songId) }
    case 'move': {
      const from = before.queue.findIndex((s) => s.id === command.songId)
      const to = after.queue.findIndex((s) => s.id === command.songId)
      return {
        actor: who,
        verb: 'moved',
        song: titleOf(before, command.songId),
        suffix: `${to < from ? 'up' : 'down'} to #${to + 1}`,
      }
    }
    default: return null
  }
}

export function describeRequest(request) {
  return {
    actor: request.singerName || UNKNOWN_ACTOR,
    verb: 'added',
    song: request.title,
    suffix: request.playNext ? 'to play next' : undefined,
  }
}

// Applies commands in order to a copy of the state, returning the queue actions to
// dispatch and what each one did.
export function planCommands(state, commands) {
  const actions = []
  const events = []
  let working = state
  for (const command of commands) {
    const action = commandToAction(command)
    if (!action) continue
    const next = reducer(working, action)
    const event = describeCommand(command.by, command, working, next)
    if (event) events.push(event)
    actions.push(action)
    working = next
  }
  return { actions, events, state: working }
}
