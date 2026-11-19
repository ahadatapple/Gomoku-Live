import { useState, type KeyboardEvent } from 'react'
import { N, type Color } from '../../game/rules'

const CELL = 40
const PAD = 34
const SIZE = PAD * 2 + CELL * (N - 1)
const STARS = [
  [3, 3],
  [3, 11],
  [7, 7],
  [11, 3],
  [11, 11],
]
const LETTERS = 'ABCDEFGHJKLMNOP' // Go-style: no "I"

export const cellName = (idx: number) => `${LETTERS[idx % N]}${N - Math.floor(idx / N)}`

const pos = (idx: number) => ({ x: PAD + (idx % N) * CELL, y: PAD + Math.floor(idx / N) * CELL })

type Props = {
  board: Uint8Array
  lastIdx: number
  winLine: number[] | null
  /** Colour the local player places, when it is their turn. */
  playAs: Color | null
  pendingIdx: number | null
  peerHovers: { idx: number; color: Color }[]
  onPlay: (idx: number) => void
  onHover: (idx: number | null) => void
}

function Stone({ idx, color, ghost, fresh }: { idx: number; color: Color; ghost?: boolean; fresh?: boolean }) {
  const { x, y } = pos(idx)
  return (
    <circle
      cx={x}
      cy={y}
      r={CELL * 0.44}
      fill={`url(#stone-${color})`}
      stroke={color === 'O' ? '#b8ad98' : 'none'}
      strokeWidth={1}
      opacity={ghost ? 0.45 : 1}
      className={fresh ? 'stone-in' : undefined}
      style={{ filter: ghost ? undefined : 'drop-shadow(1px 2px 1.5px rgba(40,25,5,0.35))' }}
    />
  )
}

export function Board({ board, lastIdx, winLine, playAs, pendingIdx, peerHovers, onPlay, onHover }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const [cursor, setCursor] = useState<number>(7 * N + 7)
  const setH = (idx: number | null) => {
    setHover(idx)
    onHover(idx)
  }
  const canPlay = (idx: number) => playAs !== null && board[idx] === 0 && pendingIdx === null

  const onKey = (e: KeyboardEvent) => {
    const r = Math.floor(cursor / N)
    const c = cursor % N
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    if (moves[e.key]) {
      e.preventDefault()
      const [dr, dc] = moves[e.key]
      const next = Math.min(N - 1, Math.max(0, r + dr)) * N + Math.min(N - 1, Math.max(0, c + dc))
      setCursor(next)
      setH(next)
    } else if ((e.key === 'Enter' || e.key === ' ') && canPlay(cursor)) {
      e.preventDefault()
      onPlay(cursor)
    }
  }

  const winSet = new Set(winLine ?? [])
  const line = winLine && winLine.length >= 2 ? [pos(winLine[0]), pos(winLine[winLine.length - 1])] : null

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-auto w-full max-w-[min(92vw,640px)] touch-manipulation select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      role="grid"
      aria-label="Gomoku board. Use arrow keys to move, Enter to place a stone."
      tabIndex={0}
      onKeyDown={onKey}
      onMouseLeave={() => setH(null)}
      data-testid="board"
    >
      <defs>
        <radialGradient id="stone-X" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#5b5650" />
          <stop offset="55%" stopColor="#1d1a16" />
          <stop offset="100%" stopColor="#0b0a08" />
        </radialGradient>
        <radialGradient id="stone-O" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#efe9dd" />
          <stop offset="100%" stopColor="#d6ccb8" />
        </radialGradient>
        <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e3bd7c" />
          <stop offset="100%" stopColor="var(--color-board, #dcb36f)" />
        </linearGradient>
      </defs>

      <rect x={0} y={0} width={SIZE} height={SIZE} rx={6} fill="url(#wood)" stroke="var(--color-board-edge)" />

      {Array.from({ length: N }, (_, i) => (
        <g key={i} stroke="var(--color-grid)" strokeWidth={i === 0 || i === N - 1 ? 1.4 : 0.8} opacity={0.75}>
          <line x1={PAD} y1={PAD + i * CELL} x2={SIZE - PAD} y2={PAD + i * CELL} />
          <line x1={PAD + i * CELL} y1={PAD} x2={PAD + i * CELL} y2={SIZE - PAD} />
        </g>
      ))}
      {STARS.map(([r, c]) => (
        <circle key={`${r}-${c}`} cx={PAD + c * CELL} cy={PAD + r * CELL} r={3.2} fill="var(--color-grid)" />
      ))}
      {Array.from({ length: N }, (_, i) => (
        <g key={`l${i}`} fill="var(--color-grid)" fontSize={11} opacity={0.6} className="font-display">
          <text x={PAD + i * CELL} y={PAD - 18} textAnchor="middle">
            {LETTERS[i]}
          </text>
          <text x={PAD - 20} y={PAD + i * CELL + 4} textAnchor="middle">
            {N - i}
          </text>
        </g>
      ))}

      {peerHovers.map((h, i) =>
        board[h.idx] === 0 ? (
          <circle
            key={`peer${i}`}
            cx={pos(h.idx).x}
            cy={pos(h.idx).y}
            r={CELL * 0.44}
            fill="none"
            stroke={h.color === 'X' ? '#1d1a16' : '#fbf8f2'}
            strokeDasharray="4 4"
            strokeWidth={2}
            opacity={0.8}
          />
        ) : null,
      )}

      {Array.from(board, (v, idx) =>
        v ? <Stone key={idx} idx={idx} color={v === 1 ? 'X' : 'O'} fresh={idx === lastIdx} /> : null,
      )}
      {pendingIdx !== null && playAs && <Stone idx={pendingIdx} color={playAs} ghost />}
      {hover !== null && playAs && canPlay(hover) && <Stone idx={hover} color={playAs} ghost />}

      {lastIdx >= 0 && !winSet.size && (
        <circle cx={pos(lastIdx).x} cy={pos(lastIdx).y} r={5} fill="var(--color-seal)" />
      )}
      {line && (
        <line
          x1={line[0].x}
          y1={line[0].y}
          x2={line[1].x}
          y2={line[1].y}
          stroke="var(--color-seal)"
          strokeWidth={5}
          strokeLinecap="round"
          opacity={0.85}
        />
      )}

      {/* Hit targets on top of everything */}
      {Array.from({ length: N * N }, (_, idx) => {
        const { x, y } = pos(idx)
        return (
          <rect
            key={`hit${idx}`}
            x={x - CELL / 2}
            y={y - CELL / 2}
            width={CELL}
            height={CELL}
            fill="transparent"
            role="gridcell"
            aria-label={`${cellName(idx)}${board[idx] ? (board[idx] === 1 ? ' black' : ' white') : ''}`}
            style={{ cursor: canPlay(idx) ? 'pointer' : 'default' }}
            onMouseEnter={() => setH(idx)}
            onClick={() => canPlay(idx) && onPlay(idx)}
          />
        )
      })}
      {hover === cursor && (
        <rect
          x={pos(cursor).x - CELL / 2 + 3}
          y={pos(cursor).y - CELL / 2 + 3}
          width={CELL - 6}
          height={CELL - 6}
          fill="none"
          stroke="var(--color-seal)"
          strokeOpacity={0.5}
          rx={4}
          pointerEvents="none"
        />
      )}
    </svg>
  )
}
