import { useState } from 'react'
import { useQuery } from 'deepspace'
import { Mail } from 'lucide-react'
import { callAction } from '../../lib/callAction'

/** Opt-in for "your move" emails (sent after 10 minutes, once per turn). */
export function EmailToggle({ userId }: { userId: string }) {
  const { records } = useQuery<{ userId: string; emailTurns: string }>('prefs', { where: { userId }, limit: 1 })
  const on = records[0]?.data.emailTurns === 'on'
  const [busy, setBusy] = useState(false)
  return (
    <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
      <input
        type="checkbox"
        className="mt-0.5 accent-[var(--color-seal)]"
        checked={on}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true)
          await callAction('setEmailTurns', { on: e.target.checked })
          setBusy(false)
        }}
        data-testid="email-toggle"
      />
      <span>
        <Mail className="mr-1 inline h-3.5 w-3.5" aria-hidden />
        Email me if it&apos;s my move and I&apos;ve been away 10 minutes (one email per turn).
      </span>
    </label>
  )
}
