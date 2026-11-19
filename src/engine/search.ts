/**
 * Alpha-beta search around the ported eval.
 *
 * `faithfulMove` mirrors the Python `Strategy.alphabeta_search` exactly: every
 * empty cell in row-major order, the same leaf sign convention, the same
 * "update best move only when it beats alpha/beta" rule. It is used by the
 * parity tests and is far too slow for a live 15x15 game beyond depth 1.
 *
 * `bestMove` is what the app plays. It keeps the same scoring semantics but
 * changes WHICH moves are searched and FOR HOW LONG:
 *   - candidates: only empty cells within 2 of an existing stone
 *   - ordering: candidates sorted by a cheap local-threat score so alpha-beta
 *     prunes earlier
 *   - iterative deepening under a wall-clock budget: depth 1, 2, 3... until
 *     the budget runs out; the move from the deepest *completed* depth wins.
 * That budget is the search-depth vs response-time tradeoff.
 */
import { EMPTY, X, O, other, smartBoardEval, lines, type Stone } from './eval'

export type Move = { row: number; col: number }

/** Python `winner_stone`: any 5 in a row (overlines count). */
export function hasFive(board: Uint8Array, n: number, stone: Stone): boolean {
  for (const cells of lines(n)) {
    let run = 0
    for (const c of cells) {
      run = board[c] === stone ? run + 1 : 0
      if (run >= 5) return true
    }
  }
  return false
}

/** Faster win check around the last move only. */
export function winsAt(board: Uint8Array, n: number, idx: number): boolean {
  const stone = board[idx]
  if (stone === EMPTY) return false
  const r0 = Math.floor(idx / n)
  const c0 = idx % n
  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]) {
    let count = 1
    for (const sign of [1, -1]) {
      let r = r0 + dr * sign
      let c = c0 + dc * sign
      while (r >= 0 && r < n && c >= 0 && c < n && board[r * n + c] === stone) {
        count++
        r += dr * sign
        c += dc * sign
      }
    }
    if (count >= 5) return true
  }
  return false
}

export const isFull = (board: Uint8Array) => !board.includes(EMPTY)

/** Python `complete_board`. */
export function complete(board: Uint8Array, n: number): boolean {
  return hasFive(board, n, X) || hasFive(board, n, O) || isFull(board)
}

// ---------------------------------------------------------------------------
// Faithful port of Strategy.alphabeta_search / get_move
// ---------------------------------------------------------------------------

export function faithfulMove(board: Uint8Array, n: number, me: Stone, depth: number): Move | null {
  const opp = other(me)
  const rec = (b: Uint8Array, d: number, stone: Stone, alpha: number, beta: number): [number, number] => {
    if (d === 0 || complete(b, n)) {
      const s = smartBoardEval(b, n, stone)
      return [stone === opp ? -s : s, -1]
    }
    let best: number
    let bestIdx = -1
    if (stone === me) {
      best = -Infinity
      for (let i = 0; i < b.length; i++) {
        if (b[i] !== EMPTY) continue
        b[i] = stone
        const [score] = rec(b, d - 1, other(stone), alpha, beta)
        b[i] = EMPTY
        best = Math.max(score, best)
        if (best >= beta) break
        else if (best > alpha) {
          bestIdx = i
          alpha = best
        }
      }
    } else {
      best = Infinity
      for (let i = 0; i < b.length; i++) {
        if (b[i] !== EMPTY) continue
        b[i] = stone
        const [score] = rec(b, d - 1, other(stone), alpha, beta)
        b[i] = EMPTY
        best = Math.min(score, best)
        if (best <= alpha) break
        else if (best < beta) {
          bestIdx = i
          beta = best
        }
      }
    }
    return [best, bestIdx]
  }
  const [, idx] = rec(board.slice(), depth, me, -Infinity, Infinity)
  return idx < 0 ? null : { row: Math.floor(idx / n), col: idx % n }
}

// ---------------------------------------------------------------------------
// Production search
// ---------------------------------------------------------------------------

/** Empty cells within `radius` of any stone; centre on an empty board. */
export function candidates(board: Uint8Array, n: number, radius = 2): number[] {
  const out: number[] = []
  let anyStone = false
  for (let i = 0; i < board.length; i++) {
    if (board[i] === EMPTY) continue
    anyStone = true
    break
  }
  if (!anyStone) return [Math.floor(n / 2) * n + Math.floor(n / 2)]
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c
      if (board[i] !== EMPTY) continue
      let near = false
      for (let dr = -radius; dr <= radius && !near; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const rr = r + dr
          const cc = c + dc
          if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue
          if (board[rr * n + cc] !== EMPTY) {
            near = true
            break
          }
        }
      }
      if (near) out.push(i)
    }
  }
  return out
}

/** Cheap move-ordering score: longest lines this cell would make or block. */
function localScore(board: Uint8Array, n: number, idx: number, me: Stone): number {
  const r0 = Math.floor(idx / n)
  const c0 = idx % n
  let score = 0
  for (const stone of [me, other(me)]) {
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ]) {
      let count = 0
      for (const sign of [1, -1]) {
        let r = r0 + dr * sign
        let c = c0 + dc * sign
        while (r >= 0 && r < n && c >= 0 && c < n && board[r * n + c] === stone) {
          count++
          r += dr * sign
          c += dc * sign
        }
      }
      score += count >= 4 ? 10000 : count * count * (stone === me ? 2 : 1)
    }
  }
  return score
}

export type SearchStats = {
  depthReached: number
  nodes: number
  ms: number
  timedOut: boolean
  candidates: number
}

class Timeout extends Error {}

export function bestMove(
  board: Uint8Array,
  n: number,
  me: Stone,
  opts: {
    maxDepth: number
    budgetMs: number
    now?: () => number
    /** Defaults to the ported smart_board_eval. */
    evalFn?: (board: Uint8Array, n: number, stone: Stone) => number
  },
): { move: Move | null; stats: SearchStats } {
  const now = opts.now ?? (() => Date.now())
  const start = now()
  const deadline = start + opts.budgetMs
  const opp = other(me)
  const evalFn = opts.evalFn ?? smartBoardEval
  const b = board.slice()
  let nodes = 0

  // Immediate win: no search needed.
  const rootCands = candidates(b, n)
  for (const i of rootCands) {
    b[i] = me
    const win = winsAt(b, n, i)
    b[i] = EMPTY
    if (win) {
      return {
        move: { row: Math.floor(i / n), col: i % n },
        stats: { depthReached: 1, nodes: 1, ms: now() - start, timedOut: false, candidates: rootCands.length },
      }
    }
  }

  const ordered = (bb: Uint8Array, stone: Stone) =>
    candidates(bb, n)
      .map((i) => [i, localScore(bb, n, i, stone)] as const)
      .sort((a, b2) => b2[1] - a[1])
      .map(([i]) => i)

  const rec = (d: number, stone: Stone, alpha: number, beta: number, lastIdx: number): [number, number] => {
    if ((++nodes & 63) === 0 && now() > deadline) throw new Timeout()
    const terminal = lastIdx >= 0 && winsAt(b, n, lastIdx)
    if (d === 0 || terminal || isFull(b)) {
      const s = evalFn(b, n, stone)
      return [stone === opp ? -s : s, -1]
    }
    let best = stone === me ? -Infinity : Infinity
    let bestIdx = -1
    for (const i of ordered(b, stone)) {
      b[i] = stone
      let score: number
      try {
        ;[score] = rec(d - 1, other(stone), alpha, beta, i)
      } finally {
        b[i] = EMPTY
      }
      if (stone === me) {
        best = Math.max(score, best)
        if (best >= beta) break
        if (best > alpha) {
          bestIdx = i
          alpha = best
        }
      } else {
        best = Math.min(score, best)
        if (best <= alpha) break
        if (best < beta) {
          bestIdx = i
          beta = best
        }
      }
    }
    return [best, bestIdx]
  }

  let bestIdx = rootCands.length ? ordered(b, me)[0] : -1
  let depthReached = 0
  let timedOut = false
  for (let d = 1; d <= opts.maxDepth; d++) {
    try {
      const [, idx] = rec(d, me, -Infinity, Infinity, -1)
      if (idx >= 0) bestIdx = idx
      depthReached = d
    } catch (e) {
      if (!(e instanceof Timeout)) throw e
      timedOut = true
      break
    }
    if (now() > deadline) break
  }
  return {
    move: bestIdx < 0 ? null : { row: Math.floor(bestIdx / n), col: bestIdx % n },
    stats: { depthReached, nodes, ms: now() - start, timedOut, candidates: rootCands.length },
  }
}
