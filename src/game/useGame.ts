import { useMemo } from 'react'
import { useQuery } from 'deepspace'
import { N, replay, type Color } from './rules'
import type { GameRecord, MoveRecord, SeatRecord } from './types'

/** Live view of one game: record + seats + move log, replayed into a position. */
export function useGame(gameId: string) {
  const game = useQuery<GameRecord>('games', { where: { recordId: gameId }, limit: 1 })
  const seatQ = useQuery<SeatRecord>('seats', { where: { gameId }, limit: 4 })
  const moveQ = useQuery<MoveRecord>('moves', { where: { gameId }, orderBy: 'ply', orderDir: 'asc', limit: N * N + 5 })

  const moves = useMemo(() => moveQ.records.map((r) => r.data).sort((a, b) => a.ply - b.ply), [moveQ.records])
  const state = useMemo(() => replay(moves), [moves])
  const seats = useMemo(() => {
    const s: Partial<Record<Color, string>> = {}
    for (const r of seatQ.records) s[r.data.color] = r.data.userId
    return s
  }, [seatQ.records])

  const status = [game.status, seatQ.status, moveQ.status]
  return {
    loading: status.includes('loading'),
    error: game.error ?? seatQ.error ?? moveQ.error,
    notFound: game.status === 'ready' && game.records.length === 0,
    game: game.records[0]?.data ?? null,
    seats,
    moves,
    state,
  }
}
