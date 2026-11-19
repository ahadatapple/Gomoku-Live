/**
 * Pure game rules shared by the server actions (authoritative) and the UI
 * (display only). Freestyle Gomoku on 15x15: black (X) moves first, five or
 * more in a row wins.
 */
import { EMPTY, O, X, type Stone } from '../engine/eval'

export const N = 15
export type Color = 'X' | 'O'
export type MoveRow = { ply: number; idx: number; stone: string }

export const colorOf = (s: Stone): Color => (s === X ? 'X' : 'O')
export const stoneOf = (c: Color): Stone => (c === 'X' ? X : O)
export const toMoveAt = (ply: number): Color => (ply % 2 === 0 ? 'X' : 'O')

const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const

/** Cells of the 5+ line through `idx`, or null. */
export function lineThrough(board: Uint8Array, idx: number, n = N): number[] | null {
  const stone = board[idx]
  if (stone === EMPTY) return null
  const r0 = Math.floor(idx / n)
  const c0 = idx % n
  for (const [dr, dc] of DIRS) {
    const cells = [idx]
    for (const sign of [1, -1]) {
      let r = r0 + dr * sign
      let c = c0 + dc * sign
      while (r >= 0 && r < n && c >= 0 && c < n && board[r * n + c] === stone) {
        cells.push(r * n + c)
        r += dr * sign
        c += dc * sign
      }
    }
    if (cells.length >= 5) return cells.sort((a, b) => a - b)
  }
  return null
}

export type GameState = {
  board: Uint8Array
  ply: number
  toMove: Color
  winner: Color | 'draw' | null
  winLine: number[] | null
  lastIdx: number
  /** Set when the stored log is not a legal game (should never happen). */
  corrupt?: string
}

/** Rebuild the position from the move log, checking it as it goes. */
export function replay(moves: MoveRow[], n = N): GameState {
  const board = new Uint8Array(n * n)
  const sorted = [...moves].sort((a, b) => a.ply - b.ply)
  let winner: GameState['winner'] = null
  let winLine: number[] | null = null
  let lastIdx = -1
  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i]
    const expect = toMoveAt(i)
    if (m.ply !== i || m.stone !== expect || board[m.idx] !== EMPTY || winner) {
      return { board, ply: i, toMove: expect, winner, winLine, lastIdx, corrupt: `bad move at ply ${i}` }
    }
    board[m.idx] = stoneOf(expect)
    lastIdx = m.idx
    const line = lineThrough(board, m.idx, n)
    if (line) {
      winner = expect
      winLine = line
    } else if (i + 1 === n * n) {
      winner = 'draw'
    }
  }
  return { board, ply: sorted.length, toMove: toMoveAt(sorted.length), winner, winLine, lastIdx }
}

export type MoveCheck = { ok: true } | { ok: false; code: string; error: string }

/** Every rule the server enforces before accepting a move. */
export function checkMove(
  state: GameState,
  seats: Partial<Record<Color, string>>,
  callerId: string,
  idx: number,
  n = N,
): MoveCheck {
  if (state.corrupt) return { ok: false, code: 'corrupt', error: 'This game log is inconsistent.' }
  if (state.winner) return { ok: false, code: 'game_over', error: 'The game is already over.' }
  if (!Number.isInteger(idx) || idx < 0 || idx >= n * n)
    return { ok: false, code: 'bad_cell', error: 'That cell is off the board.' }
  const mover = seats[state.toMove]
  if (!mover || !seats.X || !seats.O) return { ok: false, code: 'waiting', error: 'Waiting for an opponent to join.' }
  if (mover !== callerId) {
    const isPlayer = seats.X === callerId || seats.O === callerId
    return isPlayer
      ? { ok: false, code: 'not_your_turn', error: "It's not your turn." }
      : { ok: false, code: 'not_a_player', error: 'Only the two players can move.' }
  }
  if (state.board[idx] !== EMPTY) return { ok: false, code: 'occupied', error: 'That cell is taken.' }
  return { ok: true }
}
