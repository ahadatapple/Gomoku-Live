import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthOverlay, useAuth, useQuery } from 'deepspace'
import { Cpu, Users } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { GameList } from '../../components/game/GameList'
import { callAction } from '../../lib/callAction'
import type { GameRecord } from '../../game/types'
import { cn } from '../../lib/utils'

type Pick = 'X' | 'O' | 'random'
const LEVELS = [
  { id: 'easy', label: 'Easy', note: '1-ply, noisy eval (your slider_eval)' },
  { id: 'medium', label: 'Medium', note: '2-ply alpha-beta' },
  { id: 'hard', label: 'Hard', note: 'up to 4-ply, capped at 12,000 positions' },
] as const
const LIVE_WINDOW_MS = 30 * 60 * 1000

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: readonly { id: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-border bg-background p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'rounded px-3 py-1 text-sm transition-colors',
            value === o.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const COLORS = [
  { id: 'X' as Pick, label: '● Black' },
  { id: 'O' as Pick, label: '○ White' },
  { id: 'random' as Pick, label: 'Random' },
]

export default function PlayPage() {
  const { userId, isSignedIn } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [level, setLevel] = useState<(typeof LEVELS)[number]['id']>('medium')
  const [botColor, setBotColor] = useState<Pick>('X')
  const [pvpColor, setPvpColor] = useState<Pick>('random')
  const [busy, setBusy] = useState<string | null>(null)
  const [signIn, setSignIn] = useState(false)
  const { records, status } = useQuery<GameRecord>('games', { orderBy: 'lastMoveAt', orderDir: 'desc', limit: 150 })

  const start = async (mode: 'bot' | 'pvp') => {
    if (!isSignedIn) return setSignIn(true)
    setBusy(mode)
    const r = await callAction<{ gameId: string }>('createGame', {
      mode,
      level,
      color: mode === 'bot' ? botColor : pvpColor,
    })
    setBusy(null)
    if (r.success) navigate(`/g/${r.data.gameId}`)
    else toast.error('Could not start a game', r.error)
  }

  const mine = (g: GameRecord) => !!userId && (g.blackId === userId || g.whiteId === userId)
  const now = Date.now()
  const open = records.filter((r) => r.data.status === 'waiting' && r.data.mode === 'pvp' && !mine(r.data))
  const live = records.filter(
    (r) => r.data.status === 'active' && now - new Date(r.data.lastMoveAt ?? 0).getTime() < LIVE_WINDOW_MS,
  )
  const yours = records.filter((r) => mine(r.data)).slice(0, 12)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-display mb-1 text-3xl">Play</h1>
      <p className="mb-6 text-muted-foreground">Fifteen by fifteen. Black moves first. Five in a row wins.</p>

      <div className="mb-10 grid gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-md border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <Cpu className="h-5 w-5" aria-hidden /> Play the engine
          </h2>
          <div className="flex flex-col gap-1.5">
            <Segmented label="Engine strength" value={level} options={LEVELS} onChange={setLevel} />
            <p className="text-xs text-muted-foreground">{LEVELS.find((l) => l.id === level)?.note}</p>
          </div>
          <Segmented label="Your colour" value={botColor} options={COLORS} onChange={setBotColor} />
          <Button className="mt-auto" disabled={!!busy} onClick={() => start('bot')} data-testid="start-bot">
            {busy === 'bot' ? 'Setting up…' : 'Start game'}
          </Button>
        </section>

        <section className="flex flex-col gap-4 rounded-md border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <Users className="h-5 w-5" aria-hidden /> Challenge a friend
          </h2>
          <p className="text-sm text-muted-foreground">
            You get a link. Whoever opens it first takes the other seat, and anyone else can watch.
          </p>
          <Segmented label="Your colour" value={pvpColor} options={COLORS} onChange={setPvpColor} />
          <Button className="mt-auto" variant="outline" disabled={!!busy} onClick={() => start('pvp')} data-testid="start-pvp">
            {busy === 'pvp' ? 'Creating…' : 'Create challenge link'}
          </Button>
        </section>
      </div>

      {status === 'loading' ? (
        <p className="text-sm text-muted-foreground">Loading games…</p>
      ) : (
        <div className="grid gap-8">
          <GameList title="Open challenges" games={open} me={userId} empty="No one is waiting right now." action="Join" />
          <GameList title="Live now" games={live} me={userId} empty="No games in progress." action="Watch" />
          {isSignedIn && (
            <GameList title="Your games" games={yours} me={userId} empty="You haven't played yet." action="Open" />
          )}
        </div>
      )}
      {signIn && <AuthOverlay onClose={() => setSignIn(false)} />}
    </div>
  )
}
