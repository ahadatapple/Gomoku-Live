import { describe, expect, it } from 'vitest'
import fixtures from './fixtures.json'
import { EMPTY, O, X, smartBoardEval, type Stone } from './eval'
import { bestMove, faithfulMove, hasFive } from './search'

const decode = (rows: string[]) => {
  const n = rows.length
  const b = new Uint8Array(n * n)
  rows.forEach((row, r) => [...row].forEach((ch, c) => (b[r * n + c] = ch === 'X' ? X : ch === 'O' ? O : EMPTY)))
  return b
}

describe('parity with the original Python engine', () => {
  it.each(fixtures.evals.map((f, i) => [i, f] as const))('smart_board_eval #%i', (_, f) => {
    const b = decode(f.rows)
    expect(smartBoardEval(b, f.n, X)).toBe(f.X)
    expect(smartBoardEval(b, f.n, O)).toBe(f.O)
  })

  it.each(fixtures.moves.map((f, i) => [i, f] as const))('Strategy.get_move #%i', (_, f) => {
    const b = decode(f.rows)
    const move = faithfulMove(b, f.n, (f.me === 'X' ? X : O) as Stone, f.depth)
    expect(move ? [move.row, move.col] : null).toEqual(f.move)
  })
})

describe('production search', () => {
  const empty = (n = 15) => new Uint8Array(n * n)
  const put = (b: Uint8Array, s: Stone, cells: [number, number][]) => cells.forEach(([r, c]) => (b[r * 15 + c] = s))

  it('opens in the centre', () => {
    expect(bestMove(empty(), 15, X, { maxDepth: 2, maxNodes: 5000 }).move).toEqual({ row: 7, col: 7 })
  })

  it('takes a win in one', () => {
    const b = empty()
    put(b, O, [[7, 3], [7, 4], [7, 5], [7, 6]])
    put(b, X, [[3, 3], [4, 4], [9, 9], [10, 10]])
    const { move } = bestMove(b, 15, O, { maxDepth: 3, maxNodes: 5000 })
    b[move!.row * 15 + move!.col] = O
    expect(hasFive(b, 15, O)).toBe(true)
  })

  it('blocks an open four-threat', () => {
    const b = empty()
    put(b, X, [[7, 4], [7, 5], [7, 6], [7, 7]])
    put(b, O, [[6, 5], [8, 6], [6, 7]])
    const { move } = bestMove(b, 15, O, { maxDepth: 2, maxNodes: 5000 })
    expect([[7, 3], [7, 8]]).toContainEqual([move!.row, move!.col])
  })

  it('stops at the position cap even with a frozen clock (as on Workers)', () => {
    const b = empty()
    put(b, X, [[7, 7], [8, 8], [6, 8]])
    put(b, O, [[7, 8], [8, 7]])
    const frozen = () => 1_000_000 // Workers: Date.now() does not advance during CPU work
    const { move, stats } = bestMove(b, 15, X, { maxDepth: 6, maxNodes: 3000, budgetMs: 10, now: frozen })
    expect(stats.nodes).toBeLessThanOrEqual(3001)
    expect(stats.timedOut).toBe(true)
    expect(stats.depthReached).toBeGreaterThanOrEqual(1)
    expect(stats.depthReached).toBeLessThan(6)
    expect(move).not.toBeNull()
  })
})
