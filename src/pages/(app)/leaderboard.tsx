import { useMemo } from 'react'
import { useAuth, useQuery, useUserLookup } from 'deepspace'
import { standings, type Line } from '../../game/standings'
import type { GameRecord } from '../../game/types'
import { cn } from '../../lib/utils'

function Table({ rows, me, empty }: { rows: Line[]; me: string | null; empty: string }) {
  const { getName } = useUserLookup()
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
          <th className="w-8 py-2 font-medium">#</th>
          <th className="py-2 font-medium">Player</th>
          <th className="w-12 py-2 text-right font-medium">W</th>
          <th className="w-12 py-2 text-right font-medium">L</th>
          <th className="w-12 py-2 text-right font-medium">D</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 25).map((r, i) => (
          <tr key={r.userId} className={cn('border-t border-border', r.userId === me && 'text-[var(--color-seal)]')}>
            <td className="py-2 font-display">{i + 1}</td>
            <td className="truncate py-2">{r.userId === me ? 'You' : (getName(r.userId) ?? 'Player')}</td>
            <td className="py-2 text-right tabular-nums">{r.w}</td>
            <td className="py-2 text-right tabular-nums">{r.l}</td>
            <td className="py-2 text-right tabular-nums">{r.d}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function LeaderboardPage() {
  const { userId } = useAuth()
  const { records, status } = useQuery<GameRecord>('games', { where: { status: 'finished' }, limit: 1000 })
  const s = useMemo(() => standings(records.map((r) => r.data)), [records])
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display mb-1 text-3xl">Leaderboard</h1>
      <p className="mb-8 text-muted-foreground">Ranked by wins, then fewest losses. Updates live as games finish.</p>
      {status === 'loading' ? (
        <p className="text-sm text-muted-foreground">Counting…</p>
      ) : (
        <div className="grid gap-10">
          <section>
            <h2 className="mb-2 text-lg font-medium">Head to head</h2>
            <Table rows={s.pvp} me={userId} empty="No finished games between players yet." />
          </section>
          <section>
            <h2 className="mb-2 text-lg font-medium">Against the engine</h2>
            <div className="grid gap-6 sm:grid-cols-3">
              {(['easy', 'medium', 'hard'] as const).map((lvl) => (
                <div key={lvl}>
                  <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{lvl}</h3>
                  <Table rows={s.engine[lvl] ?? []} me={userId} empty="No games yet." />
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
