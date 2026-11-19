import { BOT_ID, type GameRecord } from './types'

export type Line = { userId: string; w: number; l: number; d: number }
export type Standings = { pvp: Line[]; engine: Record<string, Line[]> }

const bump = (m: Map<string, Line>, uid: string, k: 'w' | 'l' | 'd') => {
  const row = m.get(uid) ?? { userId: uid, w: 0, l: 0, d: 0 }
  row[k]++
  m.set(uid, row)
}
const rank = (m: Map<string, Line>) =>
  [...m.values()].sort((a, b) => b.w - a.w || a.l - b.l || b.d - a.d || a.userId.localeCompare(b.userId))

/** Derive the leaderboard from finished games (cancelled challenges excluded). */
export function standings(games: GameRecord[]): Standings {
  const pvp = new Map<string, Line>()
  const engine: Record<string, Map<string, Line>> = {}
  for (const g of games) {
    if (g.status !== 'finished' || g.endReason === 'cancelled' || !g.blackId || !g.whiteId) continue
    const table = g.mode === 'bot' ? (engine[g.level || 'medium'] ??= new Map()) : pvp
    for (const [uid, color] of [
      [g.blackId, 'X'],
      [g.whiteId, 'O'],
    ] as const) {
      if (uid === BOT_ID) continue
      bump(table, uid, g.winner === 'draw' ? 'd' : g.winner === color ? 'w' : 'l')
    }
  }
  return {
    pvp: rank(pvp),
    engine: Object.fromEntries(Object.entries(engine).map(([k, m]) => [k, rank(m)])),
  }
}
