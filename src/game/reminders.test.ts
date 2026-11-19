import { describe, expect, it } from 'vitest'
import { dueReminders, REMIND_AFTER_MS } from './reminders'

const now = Date.parse('2026-11-19T20:00:00Z')
const ago = (ms: number) => new Date(now - ms).toISOString()
const game = (id: string, p: Record<string, unknown>) => ({
  recordId: id,
  data: { mode: 'pvp' as const, status: 'active' as const, blackId: 'a', whiteId: 'b', moveCount: 3, lastMoveAt: ago(REMIND_AFTER_MS + 1), ...p },
})

describe('turn reminders', () => {
  it('reminds the player to move, once per ply, only if opted in', () => {
    const due = dueReminders(
      [
        game('g1', {}), // b to move (ply 3), waited 10m → due
        game('g2', { remindedPly: 3 }), // already reminded for this ply
        game('g3', { lastMoveAt: ago(60_000) }), // too soon
        game('g4', { moveCount: 4 }), // a to move, but a didn't opt in
        game('g5', { mode: 'bot' }),
        game('g6', { status: 'finished' }),
        game('g7', { lastMoveAt: ago(8 * 24 * 3600 * 1000) }), // abandoned
      ],
      new Set(['b']),
      now,
    )
    expect(due).toEqual([{ gameId: 'g1', userId: 'b', ply: 3, opponentId: 'a' }])
  })
})
