import { arrayMove } from '@dnd-kit/sortable'

// Turns a drag (song activeId dropped on song overId) into the reordered list and the
// "move after" anchor sent to the TV. The anchor is a song id rather than an index,
// because the TV's queue may have changed since the phone last saw it.
export function planMove(queue, activeId, overId) {
  if (activeId === overId) return null
  const from = queue.findIndex((s) => s.id === activeId)
  const to = queue.findIndex((s) => s.id === overId)
  if (from === -1 || to === -1) return null
  const reordered = arrayMove(queue, from, to)
  return { reordered, afterId: to === 0 ? null : reordered[to - 1].id }
}
