/**
 * Faithful TypeScript port of `smart_board_eval` from the original Python
 * engine (kille.py + utils.py). Quirks are kept on purpose so the port can be
 * checked score-for-score against the Python (see engine.parity.test.ts):
 *
 *  - `live_k` for k < 4 scans `range(len(row) - 5)`, so it skips the last
 *    window of each line (and every length-5 diagonal).
 *  - Dead-shape bonuses are added once per k, not multiplied by the count.
 *  - `iter_seqs` yields the two corner diagonals twice (once from the row loop
 *    and once from the column loop), so they are scored twice.
 *
 * Board encoding: Uint8Array of size n*n, row-major. 0 = empty, 1 = X, 2 = O.
 */

export const EMPTY = 0
export const X = 1
export const O = 2
export type Stone = typeof X | typeof O

export const other = (s: Stone): Stone => (s === X ? O : X)

const linesCache = new Map<number, number[][]>()

/** Cell-index lists for every sequence `iter_seqs` yields, in the same order. */
export function lines(n: number): number[][] {
  const cached = linesCache.get(n)
  if (cached) return cached
  const out: number[][] = []
  const idx = (r: number, c: number) => r * n + c
  // get_updiag(row, col): board[row - i][col + i] for i < min(row + 1, n - col)
  const up = (r: number, c: number) => {
    const len = Math.min(r + 1, n - c)
    return Array.from({ length: len }, (_, i) => idx(r - i, c + i))
  }
  // get_downdiag(row, col): board[row + i][col + i] for i < min(n - row, n - col)
  const down = (r: number, c: number) => {
    const len = Math.min(n - r, n - c)
    return Array.from({ length: len }, (_, i) => idx(r + i, c + i))
  }
  for (let r = 0; r < n; r++) out.push(Array.from({ length: n }, (_, c) => idx(r, c)))
  for (let c = 0; c < n; c++) out.push(Array.from({ length: n }, (_, r) => idx(r, c)))
  for (let r = 0; r < n; r++) {
    const u = up(r, 0)
    if (u.length >= 5) out.push(u)
    const d = down(r, 0)
    if (d.length >= 5) out.push(d)
  }
  for (let c = 0; c < n; c++) {
    const u = up(n - 1, c)
    if (u.length >= 5) out.push(u)
    const d = down(0, c)
    if (d.length >= 5) out.push(d)
  }
  linesCache.set(n, out)
  return out
}

/** Count windows of length `k` that are all `stone`. */
function consecutiveK(row: Uint8Array, k: number, stone: number): number {
  let total = 0
  let run = 0
  for (let i = 0; i < row.length; i++) {
    run = row[i] === stone ? run + 1 : 0
    if (run >= k) total++
  }
  return total
}

/** True when row[from..to) contains `k` consecutive `stone`. */
function hasRun(row: Uint8Array, from: number, to: number, k: number, stone: number): boolean {
  let run = 0
  for (let i = from; i < to; i++) {
    run = row[i] === stone ? run + 1 : 0
    if (run >= k) return true
  }
  return false
}

function windowCounts(row: Uint8Array, i: number, stone: number): [number, number] {
  let s = 0
  let e = 0
  const end = Math.min(i + 5, row.length)
  for (let j = i; j < end; j++) {
    if (row[j] === stone) s++
    else if (row[j] === EMPTY) e++
  }
  return [s, e]
}

function liveK(row: Uint8Array, k: number, stone: number): number {
  if (k < 4) {
    let total = 0
    for (let i = 0; i < row.length - 5; i++) {
      // consecutive_k in (row[i+j:i+j+k] for j in range(5-k+1)) <=> a k-run inside row[i:i+5]
      const [, e] = windowCounts(row, i, stone)
      if (hasRun(row, i, i + 5, k, stone) && e === 5 - k) total++
    }
    return total
  }
  if (k === 4) {
    // int("-" + stone*4 + "-" in "".join(row))
    for (let i = 0; i + 5 < row.length; i++) {
      if (
        row[i] === EMPTY &&
        row[i + 1] === stone &&
        row[i + 2] === stone &&
        row[i + 3] === stone &&
        row[i + 4] === stone &&
        row[i + 5] === EMPTY
      )
        return 1
    }
    return 0
  }
  return 0
}

function deadK(row: Uint8Array, k: number, stone: number): number {
  const len = row.length
  let c = 0
  // row[:5] and row[-5:] edge checks
  {
    const [s, e] = windowCounts(row, 0, stone)
    if (s === k && e === 5 - k && row[0] === stone) c++
  }
  {
    const start = Math.max(0, len - 5)
    const [s, e] = windowCounts(row, start, stone)
    if (s === k && e === 5 - k && row[len - 1] === stone) c++
  }
  for (let i = 0; i < len - 4; i++) {
    const [s, e] = windowCounts(row, i, stone)
    if (s === k && e === 5 - k && !hasRun(row, i, i + 5, k, stone)) c++
  }
  if (k === 4) {
    for (let i = 0; i < len - 4; i++) {
      const [s, e] = windowCounts(row, i, stone)
      if (s === k && e === 5 - k) c++
    }
  }
  return c
}

/** Python `smart_board_eval(board, stone)`. */
export function smartBoardEval(board: Uint8Array, n: number, stone: Stone): number {
  const MAX = 100000000
  const OP = 1000000
  const seqs = lines(n)
  const buf = new Uint8Array(n)
  const get = (cells: number[]) => {
    const row = buf.subarray(0, cells.length)
    for (let i = 0; i < cells.length; i++) row[i] = board[cells[i]]
    return row
  }

  let retval = 0
  let five = 0
  const live = [0, 0, 0, 0, 0]
  const dead = [0, 0, 0, 0, 0]
  for (const cells of seqs) {
    const seq = get(cells)
    for (let k = 2; k < 5; k++) {
      live[k] += liveK(seq, k, stone)
      dead[k] += deadK(seq, k, stone)
    }
    five += consecutiveK(seq, 5, stone)
  }
  const liveW = [0, 0, 10, 1000, MAX]
  const deadW = [0, 0, 5, 10, MAX]
  for (let k = 2; k < 5; k++) {
    if (live[k]) retval += live[k] * liveW[k]
    if (dead[k]) retval += deadW[k]
  }
  if (five) return 100000000

  const opp = other(stone)
  const liveO = [0, 0, 0, 0, 0]
  const deadO = [0, 0, 0, 0, 0]
  for (const cells of seqs) {
    const seq = get(cells)
    for (let k = 2; k < 5; k++) {
      liveO[k] += liveK(seq, k, opp)
      deadO[k] += deadK(seq, k, opp)
    }
    five += consecutiveK(seq, 5, opp)
  }
  const liveWO = [0, 0, 10, 500, OP]
  const deadWO = [0, 0, 5, 50, OP / 2]
  for (let k = 2; k < 5; k++) {
    if (liveO[k]) retval -= liveO[k] * liveWO[k]
    if (deadO[k]) retval -= deadWO[k]
  }
  if (five) return -10000000
  return retval
}

/** Python `slider_eval`: with probability (1 - difficulty) return noise. */
export function sliderEval(difficulty: number, rand: () => number = Math.random) {
  return (board: Uint8Array, n: number, stone: Stone) =>
    rand() >= difficulty ? rand() : smartBoardEval(board, n, stone)
}
