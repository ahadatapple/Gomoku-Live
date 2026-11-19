import { describe, expect, it } from 'vitest'
import { analyse, coord } from './analysis'
import { N, type MoveRow } from './rules'

const at = (col: string, row: number) => (N - row) * N + 'ABCDEFGHJKLMNOP'.indexOf(col)
const game = (cells: number[]): MoveRow[] => cells.map((idx, ply) => ({ ply, idx, stone: ply % 2 ? 'O' : 'X' }))

describe('post-game analysis', () => {
  it('coordinates match the board labels', () => {
    expect(coord(at('A', 15))).toBe('A15')
    expect(coord(at('H', 8))).toBe('H8')
  })

  it('flags a missed block and the losing move', () => {
    // Black builds H8..L8; White ignores the four and plays elsewhere.
    const g = game([at('H', 8), at('A', 1), at('J', 8), at('A', 2), at('K', 8), at('A', 3), at('L', 8), at('C', 5), at('M', 8)])
    const m = analyse(g, { engineDepth: 0 })
    // After L8 Black has an open four (G8 and M8): a double threat.
    expect(m.find((x) => x.kind === 'double_threat')).toMatchObject({ color: 'X', played: 'L8', better: ['G8', 'M8'] })
  })

  it('flags a missed win in one', () => {
    // Black has four (H8..L8 with G8 blocked), plays elsewhere instead of M8.
    const g = game([at('H', 8), at('G', 8), at('J', 8), at('A', 1), at('K', 8), at('A', 2), at('L', 8), at('A', 3), at('C', 12)])
    const m = analyse(g, { focus: 'X', engineDepth: 0 })
    expect(m).toContainEqual(expect.objectContaining({ kind: 'missed_win', ply: 8, played: 'C12', better: ['M8'] }))
  })

  it('flags a missed single block', () => {
    const g = game([at('H', 8), at('G', 8), at('J', 8), at('A', 1), at('K', 8), at('A', 2), at('L', 8), at('A', 3)])
    const m = analyse(g, { focus: 'O', engineDepth: 0 })
    expect(m).toContainEqual(expect.objectContaining({ kind: 'missed_block', ply: 7, played: 'A3', better: ['M8'] }))
  })

  it('engine comparison runs quickly on a full game', () => {
    const g = game([at('H', 8), at('H', 9), at('J', 8), at('G', 7), at('K', 8), at('L', 8), at('J', 9), at('J', 7), at('K', 10)])
    const t = Date.now()
    analyse(g, { engineDepth: 2 })
    expect(Date.now() - t).toBeLessThan(5000)
  })
})
