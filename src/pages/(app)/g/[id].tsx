import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AuthOverlay, useAuth, usePresenceRoom, useUserLookup } from 'deepspace'
import { Check, Copy, Cpu, Eye, Flag, RotateCcw } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { Board, cellName } from '../../../components/game/Board'
import { callAction } from '../../../lib/callAction'
import { N, type Color } from '../../../game/rules'
import { BOT_ID } from '../../../game/types'
import { useGame } from '../../../game/useGame'
import { cn } from '../../../lib/utils'

const COLOR_NAME: Record<Color, string> = { X: 'Black', O: 'White' }
const LEVEL_NAME: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

export default function GamePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { userId, isSignedIn } = useAuth()
  const { getName } = useUserLookup()
  const toast = useToast()
  const { loading, notFound, game, seats, moves, state } = useGame(id)
  const { peers, updateState } = usePresenceRoom(`game:${id}`)
  const [pendingIdx, setPendingIdx] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [signIn, setSignIn] = useState(false)

  const myColor: Color | null = seats.X && seats.X === userId ? 'X' : seats.O && seats.O === userId ? 'O' : null
  const finished = game?.status === 'finished' || !!state.winner
  const isBotGame = game?.mode === 'bot'
  const botToMove = isBotGame && !finished && seats[state.toMove] === BOT_ID
  const myTurn = !!myColor && !finished && state.toMove === myColor && !!seats.X && !!seats.O
  const nameOf = (uid?: string) =>
    !uid ? null : uid === BOT_ID ? `Engine · ${LEVEL_NAME[game?.level ?? ''] ?? ''}` : uid === userId ? 'You' : (getName(uid) ?? 'Player')

  // Clear the ghost stone once the authoritative move arrives.
  useEffect(() => {
    if (pendingIdx !== null && state.board[pendingIdx] !== 0) setPendingIdx(null)
  }, [state.board, pendingIdx])

  // Recovery: if the engine should be moving but nothing has arrived, nudge it.
  const nudged = useRef(-1)
  useEffect(() => {
    if (!botToMove || !myColor || nudged.current === state.ply) return
    const t = setTimeout(() => {
      nudged.current = state.ply
      void callAction('botMove', { gameId: id })
    }, 6000)
    return () => clearTimeout(t)
  }, [botToMove, myColor, state.ply, id])

  const play = async (idx: number) => {
    setPendingIdx(idx)
    updateState({ hover: null })
    const r = await callAction('move', { gameId: id, row: Math.floor(idx / N), col: idx % N })
    if (!r.success) {
      setPendingIdx(null)
      toast.error("Move not played", r.error)
    }
  }

  const act = async (name: string, body: Record<string, unknown>, ok?: (data: unknown) => void) => {
    setBusy(true)
    const r = await callAction(name, body)
    setBusy(false)
    if (r.success) ok?.(r.data)
    else toast.error('Something went wrong', r.error)
  }

  const rematch = () =>
    act(
      'createGame',
      { mode: game?.mode, level: game?.level, color: myColor === 'X' ? 'O' : 'X' },
      (d) => navigate(`/g/${(d as { gameId: string }).gameId}`),
    )

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.info('Copy this link', window.location.href)
    }
  }

  const peerHovers = useMemo(
    () =>
      peers
        .map((p) => {
          const hover = p.state.hover
          const color = seats.X === p.userId ? 'X' : seats.O === p.userId ? 'O' : null
          return typeof hover === 'number' && color ? { idx: hover, color: color as Color } : null
        })
        .filter((h): h is { idx: number; color: Color } => !!h),
    [peers, seats],
  )
  const here = new Set(peers.map((p) => p.userId))
  if (userId) here.add(userId)
  const spectators = peers.filter((p) => p.userId !== seats.X && p.userId !== seats.O)

  if (loading) return <Centered>Setting up the board…</Centered>
  if (notFound || !game)
    return (
      <Centered>
        <p className="mb-4">This game doesn&apos;t exist.</p>
        <Link to="/play" className="underline">
          Back to the lobby
        </Link>
      </Centered>
    )

  const status = (() => {
    if (state.winner === 'draw') return 'Board full — a draw.'
    if (game.endReason === 'cancelled') return 'Challenge cancelled.'
    if (game.endReason === 'resign') {
      const w = game.winner as Color
      return `${nameOf(seats[w === 'X' ? 'O' : 'X'])} resigned. ${COLOR_NAME[w]} wins.`
    }
    if (state.winner) {
      const w = state.winner as Color
      return seats[w] === userId ? 'Five in a row — you win.' : `${nameOf(seats[w])} wins with five in a row.`
    }
    if (!seats.X || !seats.O) return myColor ? 'Waiting for your opponent. Send them the link.' : 'Open seat — join to play.'
    if (botToMove) return 'Engine is thinking'
    if (myTurn) return 'Your move.'
    return `${nameOf(seats[state.toMove])} to move.`
  })()

  const lastBot = [...moves].reverse().find((m) => m.byId === BOT_ID)

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex flex-col items-center gap-4">
        <div
          className={cn(
            'font-display flex min-h-9 items-center gap-2 text-xl',
            myTurn && 'text-[var(--color-seal)]',
          )}
          aria-live="polite"
          data-testid="status"
        >
          {status}
          {botToMove && (
            <span className="inline-flex gap-1" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className="think-dot h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: `${i * 0.18}s` }} />
              ))}
            </span>
          )}
        </div>
        <Board
          board={state.board}
          lastIdx={state.lastIdx}
          winLine={state.winLine}
          playAs={myTurn ? myColor : null}
          pendingIdx={pendingIdx}
          peerHovers={peerHovers.filter((h) => h.color !== myColor)}
          onPlay={play}
          onHover={(idx) => myColor && !finished && updateState({ hover: idx })}
        />
      </div>

      <aside className="flex flex-col gap-5">
        <section className="rounded-md border border-border bg-card p-4">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Players</h2>
          {(['X', 'O'] as Color[]).map((c) => {
            const uid = seats[c]
            const online = uid === BOT_ID || (uid ? here.has(uid) : false)
            return (
              <div key={c} className="flex items-center gap-3 py-1.5" data-testid={`seat-${c}`}>
                <span
                  className={cn('h-5 w-5 rounded-full border', c === 'X' ? 'border-black bg-[#1d1a16]' : 'border-[#b8ad98] bg-white')}
                  aria-label={COLOR_NAME[c]}
                />
                <span className="flex-1 truncate">
                  {nameOf(uid) ?? <span className="text-muted-foreground">Open seat</span>}
                </span>
                {uid && (
                  <span
                    title={online ? 'At the board' : 'Away'}
                    className={cn('h-2 w-2 rounded-full', online ? 'bg-emerald-600' : 'bg-muted-foreground/40')}
                  />
                )}
                {!finished && state.toMove === c && seats.X && seats.O && (
                  <span className="text-xs text-[var(--color-seal)]">to move</span>
                )}
              </div>
            )
          })}
          {spectators.length > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" aria-hidden /> {spectators.length} watching
            </p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          {game.mode === 'pvp' && !finished && (
            <Button variant="outline" onClick={share} data-testid="share">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Link copied' : 'Copy challenge link'}
            </Button>
          )}
          {game.status === 'waiting' && !myColor && (
            isSignedIn ? (
              <Button disabled={busy} onClick={() => act('joinGame', { gameId: id })} data-testid="join">
                Take the open seat
              </Button>
            ) : (
              <Button onClick={() => setSignIn(true)}>Sign in to play</Button>
            )
          )}
          {myColor && !finished && (
            <Button variant="ghost" disabled={busy} onClick={() => act('resign', { gameId: id })}>
              <Flag className="h-4 w-4" /> {game.status === 'waiting' ? 'Cancel challenge' : 'Resign'}
            </Button>
          )}
          {myColor && finished && (
            <Button disabled={busy} onClick={rematch}>
              <RotateCcw className="h-4 w-4" /> Rematch, colours swapped
            </Button>
          )}
          {!myColor && <p className="text-xs text-muted-foreground">You&apos;re watching. Moves appear live.</p>}
        </section>

        {isBotGame && lastBot && (
          <section className="rounded-md border border-border bg-card p-4 text-sm">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Cpu className="h-3.5 w-3.5" /> Engine&apos;s last search
            </h2>
            <p>
              Played <b>{cellName(lastBot.idx)}</b> after searching <b>{lastBot.depth || 1} ply</b> in{' '}
              <b>{lastBot.thinkMs ?? 0} ms</b>.
            </p>
          </section>
        )}

        <section className="rounded-md border border-border bg-card p-4">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Moves · {moves.length}
          </h2>
          <ol className="grid max-h-56 grid-cols-2 gap-x-4 overflow-y-auto font-mono text-xs">
            {moves.map((m) => (
              <li key={m.ply} className={cn('flex gap-2', m.ply === moves.length - 1 && 'text-[var(--color-seal)]')}>
                <span className="w-6 text-right text-muted-foreground">{m.ply + 1}.</span>
                <span>{m.stone === 'X' ? '●' : '○'}</span>
                <span>{cellName(m.idx)}</span>
              </li>
            ))}
          </ol>
        </section>
      </aside>
      {signIn && <AuthOverlay onClose={() => setSignIn(false)} />}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[60vh] flex-col items-center justify-center text-muted-foreground">{children}</div>
}
