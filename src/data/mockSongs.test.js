import { describe, it, expect } from 'vitest'
import mockSongs from './mockSongs.js'

describe('mockSongs', () => {
  it('imports successfully and is an array', () => {
    expect(Array.isArray(mockSongs)).toBe(true)
  })

  it('contains exactly 20 items', () => {
    expect(mockSongs).toHaveLength(20)
  })

  it('each item matches the required schema', () => {
    mockSongs.forEach((song, index) => {
      expect(song, `song at index ${index}`).toHaveProperty('id')
      expect(song, `song at index ${index}`).toHaveProperty('title')
      expect(song, `song at index ${index}`).toHaveProperty('artist')
      expect(song, `song at index ${index}`).toHaveProperty('videoId')
      expect(typeof song.id).toBe('string')
      expect(typeof song.title).toBe('string')
      expect(typeof song.artist).toBe('string')
      expect(typeof song.videoId).toBe('string')
    })
  })

  it('all ids are unique', () => {
    const ids = mockSongs.map((s) => s.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(mockSongs.length)
  })
})
