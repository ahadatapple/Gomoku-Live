/**
 * Which games need a "your move" email right now. Pure, so it is unit-tested;
 * src/cron.ts does the I/O.
 *
 * A reminder goes out when an active two-player game has waited at least
 * REMIND_AFTER_MS on one player, that player opted in, and no reminder has
 * been sent for this exact ply yet. Games idle past GIVE_UP_AFTER_MS are left
 * alone, so abandoned games never turn into recurring mail.
 */
import type { GameRecord } from './types'

export const REMIND_AFTER_MS = 10 * 60 * 1000
export const GIVE_UP_AFTER_MS = 7 * 24 * 60 * 60 * 1000

export type Due = { gameId: string; userId: string; ply: number; opponentId: string }

export function dueReminders(
  games: { recordId: string; data: GameRecord & { remindedPly?: number } }[],
  optedIn: Set<string>,
  now: number,
): Due[] {
  const out: Due[] = []
  for (const { recordId, data: g } of games) {
    if (g.mode !== 'pvp' || g.status !== 'active' || !g.blackId || !g.whiteId) continue
    const ply = g.moveCount ?? 0
    if ((g.remindedPly ?? -1) === ply) continue
    const idle = now - new Date(g.lastMoveAt ?? 0).getTime()
    if (!(idle >= REMIND_AFTER_MS && idle < GIVE_UP_AFTER_MS)) continue
    const [userId, opponentId] = ply % 2 === 0 ? [g.blackId, g.whiteId] : [g.whiteId, g.blackId]
    if (!optedIn.has(userId)) continue
    out.push({ gameId: recordId, userId, ply, opponentId })
  }
  return out
}
