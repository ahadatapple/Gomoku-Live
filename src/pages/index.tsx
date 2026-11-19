/**
 * Static landing page (prerendered; no auth or websocket). The app itself
 * lives under /play.
 */
import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'

const N = 9
// A small decorative position: black about to complete five on the diagonal.
const STONES: [number, number, 'X' | 'O'][] = [
  [2, 2, 'X'], [3, 3, 'X'], [4, 4, 'X'], [5, 5, 'X'],
  [2, 3, 'O'], [3, 4, 'O'], [4, 3, 'O'], [6, 4, 'O'], [5, 3, 'O'],
]

function MiniBoard() {
  const C = 30
  const P = 18
  const S = P * 2 + C * (N - 1)
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-sm drop-shadow-sm" aria-hidden>
      <rect width={S} height={S} rx={6} fill="#dcb36f" />
      {Array.from({ length: N }, (_, i) => (
        <g key={i} stroke="#5a4220" strokeWidth={0.8} opacity={0.7}>
          <line x1={P} y1={P + i * C} x2={S - P} y2={P + i * C} />
          <line x1={P + i * C} y1={P} x2={P + i * C} y2={S - P} />
        </g>
      ))}
      {STONES.map(([r, c, s]) => (
        <circle key={`${r}${c}`} cx={P + c * C} cy={P + r * C} r={13} fill={s === 'X' ? '#1d1a16' : '#fbf8f2'} stroke={s === 'O' ? '#b8ad98' : 'none'} />
      ))}
      <circle cx={P + 6 * C} cy={P + 6 * C} r={13} fill="none" stroke="#b3352a" strokeWidth={2} strokeDasharray="4 3" />
    </svg>
  )
}

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <main data-testid="static-landing" className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-12 px-6 py-16 md:flex-row">
        <div className="max-w-md">
          <p className="mb-3 text-sm uppercase tracking-[0.2em] text-muted-foreground">Gomoku</p>
          <h1 className="font-display mb-5 text-5xl leading-tight text-foreground">Five in a row. Live.</h1>
          <p className="mb-3 text-muted-foreground">
            Play a minimax engine at three strengths, or send a friend a link and play them in real time. Anyone with the link can watch.
          </p>
          <p className="mb-8 text-sm text-muted-foreground">
            The server checks every move: whose turn it is, whether the cell is free, and whether the game is over.
          </p>
          <Link
            to="/play"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Start playing
          </Link>
        </div>
        <MiniBoard />
      </main>
    </>
  )
}
