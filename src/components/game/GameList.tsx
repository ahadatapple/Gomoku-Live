import { Link } from 'react-router-dom'
import { useUserLookup } from 'deepspace'
import type { RecordData } from 'deepspace'
import { BOT_ID, type GameRecord } from '../../game/types'

const LEVEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

export function ago(iso?: string) {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function GameList({
  title,
  games,
  me,
  empty,
  action,
}: {
  title: string
  games: RecordData<GameRecord>[]
  me: string | null
  empty: string
  action: string
}) {
  const { getName } = useUserLookup()
  const name = (uid?: string) =>
    !uid ? '—' : uid === BOT_ID ? 'Engine' : uid === me ? 'You' : (getName(uid) ?? 'Player')
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h2>
      {games.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {games.map((g) => {
            const d = g.data
            const result =
              d.status !== 'finished'
                ? null
                : d.endReason === 'cancelled'
                  ? 'cancelled'
                  : d.winner === 'draw'
                    ? 'draw'
                    : `${d.winner === 'X' ? '●' : '○'} won${d.endReason === 'resign' ? ' (resign)' : ''}`
            return (
              <li key={g.recordId}>
                <Link
                  to={`/g/${g.recordId}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/50"
                >
                  <span className="flex-1 truncate">
                    <span aria-label="Black">●</span> {name(d.blackId)}{' '}
                    <span className="text-muted-foreground">vs</span> <span aria-label="White">○</span>{' '}
                    {name(d.whiteId)}
                    {d.mode === 'bot' && d.level && (
                      <span className="ml-2 text-xs text-muted-foreground">{LEVEL[d.level]}</span>
                    )}
                  </span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {result ?? `${d.moveCount ?? 0} moves`} · {ago(d.lastMoveAt)}
                  </span>
                  <span className="text-xs font-medium text-[var(--color-seal)]">{action}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
