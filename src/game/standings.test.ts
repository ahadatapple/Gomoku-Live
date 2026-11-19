import { describe, expect, it } from 'vitest'
import { standings } from './standings'
import type { GameRecord } from './types'

const g = (p: Partial<GameRecord>): GameRecord => ({ mode: 'pvp', status: 'finished', ...p })

describe('standings', () => {
  it('counts pvp results, skips cancelled/unfinished, splits engine games by level', () => {
    const s = standings([
      g({ blackId: 'a', whiteId: 'b', winner: 'X' }),
      g({ blackId: 'b', whiteId: 'a', winner: 'X' }),
      g({ blackId: 'a', whiteId: 'b', winner: 'draw' }),
      g({ blackId: 'a', whiteId: '', endReason: 'cancelled', winner: '' }),
      g({ blackId: 'a', whiteId: 'b', status: 'active' }),
      g({ mode: 'bot', level: 'hard', blackId: 'a', whiteId: 'bot', winner: 'O' }),
    ])
    expect(s.pvp).toEqual([
      { userId: 'a', w: 1, l: 1, d: 1 },
      { userId: 'b', w: 1, l: 1, d: 1 },
    ])
    expect(s.engine.hard).toEqual([{ userId: 'a', w: 0, l: 1, d: 0 }])
  })
})
