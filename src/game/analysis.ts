/**
 * Deterministic post-game analysis. The engine finds the facts; the LLM coach
 * (src/actions/coach.ts) only explains them. That split keeps the review
 * grounded: every coordinate the coach mentions comes from here, not from the
 * model's guess about board geometry, which LLMs get wrong.
 */
import { EMPTY, smartBoardEval } from '../engine/eval'
import { bestMove, candidates } from '../engine/search'
import { N, lineThrough, stoneOf, toMoveAt, type Color, type MoveRow } from './rules'

const LETTERS = 'ABCDEFGHJKLMNOP'
export const coord = (idx: number) => `${LETTERS[idx % N]}${N - Math.floor(idx / N)}`

export type MomentKind = 'missed_win' | 'missed_block' | 'double_threat' | 'engine_disagrees'
export type Moment = {
  ply: number
  kind: MomentKind
  /** Colour of the player the moment is about. */
  color: Color
  played: string
  /** Better alternative(s), when there is one. */
  better: string[]
  /** For engine_disagrees: eval swing, from the mover's point of view. */
  swing?: number
}

/** Empty cells where `color` would complete five right now. */
export function winningCells(board: Uint8Array, color: Color): number[] {
  const s = stoneOf(color)
  const out: number[] = []
  for (const i of candidates(board, N, 1)) {
    if (board[i] !== EMPTY) continue
    board[i] = s
    if (lineThrough(board, i)) out.push(i)
    board[i] = EMPTY
  }
  return out
}

const opp = (c: Color): Color => (c === 'X' ? 'O' : 'X')

/**
 * Walk the game and return its critical moments for `focus` (or both sides).
 * `engineDepth` 0 skips the slower engine-comparison pass.
 */
export function analyse(moves: MoveRow[], opts: { focus?: Color; engineDepth?: number; maxDisagreements?: number } = {}) {
  const sorted = [...moves].sort((a, b) => a.ply - b.ply)
  const board = new Uint8Array(N * N)
  const moments: Moment[] = []
  const disagreements: Moment[] = []
  const depth = opts.engineDepth ?? 2

  for (const m of sorted) {
    const color = toMoveAt(m.ply)
    const mine = !opts.focus || opts.focus === color
    if (mine) {
      const myWins = winningCells(board, color)
      const theirWins = winningCells(board, opp(color))
      if (myWins.length && !myWins.includes(m.idx)) {
        moments.push({ ply: m.ply, kind: 'missed_win', color, played: coord(m.idx), better: myWins.map(coord) })
      } else if (!myWins.length && theirWins.length === 1 && theirWins[0] !== m.idx) {
        moments.push({ ply: m.ply, kind: 'missed_block', color, played: coord(m.idx), better: theirWins.map(coord) })
      } else if (depth > 0 && !myWins.length && !theirWins.length) {
        // Compare with the engine on quiet positions only.
        const { move } = bestMove(board, N, stoneOf(color), { maxDepth: depth, maxNodes: 2_000 })
        if (move) {
          const best = move.row * N + move.col
          if (best !== m.idx) {
            const s = stoneOf(color)
            board[best] = s
            const ifBest = smartBoardEval(board, N, s)
            board[best] = EMPTY
            board[m.idx] = s
            const ifPlayed = smartBoardEval(board, N, s)
            board[m.idx] = EMPTY
            if (ifBest > ifPlayed)
              disagreements.push({ ply: m.ply, kind: 'engine_disagrees', color, played: coord(m.idx), better: [coord(best)], swing: ifBest - ifPlayed })
          }
        }
      }
    }
    board[m.idx] = stoneOf(color)
    // After this move, did the mover create two separate ways to win next turn?
    const threats = winningCells(board, color)
    if (threats.length >= 2 && (!opts.focus || opts.focus !== color) && !lineThrough(board, m.idx)) {
      moments.push({ ply: m.ply, kind: 'double_threat', color, played: coord(m.idx), better: threats.map(coord) })
    }
  }

  disagreements.sort((a, b) => (b.swing ?? 0) - (a.swing ?? 0))
  const top = disagreements.slice(0, opts.maxDisagreements ?? 3)
  return [...moments, ...top].sort((a, b) => a.ply - b.ply)
}

export function describeMoment(m: Moment): string {
  const who = m.color === 'X' ? 'Black' : 'White'
  const at = `move ${m.ply + 1}`
  switch (m.kind) {
    case 'missed_win':
      return `${at}: ${who} played ${m.played} but could have won immediately at ${m.better.join(' or ')}.`
    case 'missed_block':
      return `${at}: ${who} played ${m.played} without blocking the opponent's winning point at ${m.better[0]}.`
    case 'double_threat':
      return `${at}: ${who} played ${m.played}, creating two winning points (${m.better.join(', ')}) — only one can be blocked.`
    case 'engine_disagrees':
      return `${at}: ${who} played ${m.played}; the engine preferred ${m.better[0]}.`
  }
}
