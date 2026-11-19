import { useState } from 'react'
import { useQuery } from 'deepspace'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui'
import { callAction } from '../../lib/callAction'
import type { Moment } from '../../game/analysis'

type Review = { gameId: string; userId: string; status: 'pending' | 'done' | 'error'; text?: string; moments?: string }

const LABEL: Record<Moment['kind'], string> = {
  missed_win: 'Missed win',
  missed_block: 'Missed block',
  double_threat: 'Double threat',
  engine_disagrees: 'Engine preferred',
}

export function CoachPanel({ gameId, userId, onJump }: { gameId: string; userId: string; onJump: (ply: number) => void }) {
  const { records } = useQuery<Review>('reviews', { where: { gameId, userId }, limit: 1 })
  const review = records[0]?.data
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    const r = await callAction('reviewGame', { gameId }, 60_000)
    setBusy(false)
    if (!r.success) setError(r.error)
  }

  let moments: Moment[] = []
  try {
    moments = review?.moments ? (JSON.parse(review.moments) as Moment[]) : []
  } catch {
    moments = []
  }
  const working = busy || review?.status === 'pending'

  return (
    <section className="rounded-md border border-border bg-card p-4 text-sm" data-testid="coach">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> Coach
      </h2>
      {review?.status === 'done' ? (
        <>
          <p className="whitespace-pre-line leading-relaxed">{review.text}</p>
          {moments.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-3">
              {moments.map((m) => (
                <li key={`${m.ply}-${m.kind}`}>
                  <button
                    className="w-full rounded px-1.5 py-1 text-left text-xs hover:bg-accent"
                    onClick={() => onJump(m.ply)}
                  >
                    <span className="font-mono text-muted-foreground">#{m.ply + 1}</span>{' '}
                    <span className="font-medium">{LABEL[m.kind]}</span>: played {m.played}
                    {m.better.length > 0 && <> — {m.better.join(' / ')}</>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Moments found by the engine; explanation written by Claude.
          </p>
        </>
      ) : (
        <>
          <p className="mb-3 text-muted-foreground">
            The engine finds the moves that decided this game, and Claude explains them.
          </p>
          <Button size="sm" disabled={working} onClick={run} data-testid="review">
            {working ? 'Reviewing…' : review?.status === 'error' ? 'Try the review again' : 'Review my game'}
          </Button>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </>
      )}
    </section>
  )
}
