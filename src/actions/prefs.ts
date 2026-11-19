import type { ActionContext, ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'

/** Opt in/out of "your move" emails. Upsert guarded by prefs.uniqueOn(userId). */
export async function setEmailTurns({ userId, params, tools }: ActionContext<Env>): Promise<ActionResult> {
  const emailTurns = params.on === true ? 'on' : 'off'
  const existing = await tools.query<{ userId: string }>('prefs', { where: { userId }, limit: 1 })
  const row = existing.success ? existing.data.records[0] : undefined
  if (row) {
    const u = await tools.update('prefs', row.recordId, { emailTurns })
    return u.success ? { success: true, data: { emailTurns } } : { success: false, error: u.error }
  }
  const c = await tools.create('prefs', { userId, emailTurns })
  if (!c.success && /Duplicate/.test(c.error)) return setEmailTurns({ userId, params, tools } as ActionContext<Env>)
  return c.success ? { success: true, data: { emailTurns } } : { success: false, error: c.error }
}
