import { describe, it, expect } from 'vitest'
import { planMove } from './queueMove'

const q = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
const ids = (list) => list.map((s) => s.id)

describe('planMove', () => {
  it('moving down anchors after the song it lands behind', () => {
    const { reordered, afterId } = planMove(q, 'a', 'c')
    expect(ids(reordered)).toEqual(['b', 'c', 'a', 'd'])
    expect(afterId).toBe('c')
  })

  it('moving up anchors after the song above its new spot', () => {
    const { reordered, afterId } = planMove(q, 'd', 'b')
    expect(ids(reordered)).toEqual(['a', 'd', 'b', 'c'])
    expect(afterId).toBe('a')
  })

  it('moving to the top anchors to nothing', () => {
    expect(planMove(q, 'c', 'a').afterId).toBeNull()
  })

  it('ignores drops on itself or on unknown songs', () => {
    expect(planMove(q, 'b', 'b')).toBeNull()
    expect(planMove(q, 'x', 'b')).toBeNull()
  })
})
