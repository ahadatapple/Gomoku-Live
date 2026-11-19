/**
 * Scheduled tasks (run by the AppCronRoom Durable Object; see worker.ts).
 *
 * turn-reminders: every 5 minutes, email players who opted in when an active
 * two-player game has been waiting on them for 10+ minutes. One email per
 * turn at most (games.remindedPly), never for games idle over a week.
 */
import type { CronTask } from 'deepspace/worker'
import { buildCronContext } from 'deepspace/worker'
import type { Env } from '../worker'
import { dueReminders } from './game/reminders'
import type { GameRecord } from './game/types'
import { callIntegrationAsOwner } from './server/integrations-call'

export const tasks: CronTask[] = [{ name: 'turn-reminders', intervalMinutes: 5 }]

type Rec<T> = { recordId: string; data: T }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export async function runTask(name: string, env: Env): Promise<void> {
  if (name !== 'turn-reminders') return
  const ctx = buildCronContext(env, env.OWNER_USER_ID, `app:${env.DEEPSPACE_APP_ID}`)
  const games = (await ctx.records.query('games', { where: { status: 'active', mode: 'pvp' }, limit: 500 })) as Rec<
    GameRecord & { remindedPly?: number }
  >[]
  if (!games.length) return
  const prefs = (await ctx.records.query('prefs', { where: { emailTurns: 'on' }, limit: 1000 })) as Rec<{
    userId: string
  }>[]
  const due = dueReminders(games, new Set(prefs.map((p) => p.data.userId)), Date.now())
  const origin = `https://${env.APP_NAME}.app.space`

  for (const d of due) {
    const [user] = (await ctx.records.query('users', { where: { recordId: d.userId }, limit: 1 })) as Rec<{
      email?: string
      name?: string
    }>[]
    const [opp] = (await ctx.records.query('users', { where: { recordId: d.opponentId }, limit: 1 })) as Rec<{
      name?: string
    }>[]
    const email = user?.data.email
    // Mark the ply first: a failing send must not turn into an email every 5 minutes.
    await ctx.records.update('games', d.gameId, { remindedPly: d.ply })
    if (!email) continue
    const link = `${origin}/g/${d.gameId}`
    const who = opp?.data.name || 'Your opponent'
    const res = await callIntegrationAsOwner(env, 'email/send', {
      to: email,
      subject: `Your move against ${who} · Gomoku`,
      text: `${who} played and it's your turn (move ${d.ply + 1}).\n\nOpen the board: ${link}\n\nTurn these emails off from any game page.`,
      html: `<p>${esc(who)} played and it's your turn (move ${d.ply + 1}).</p><p><a href="${link}">Open the board</a></p><p style="color:#6b6256;font-size:12px">You get at most one email per turn. Turn them off from any game page.</p>`,
    })
    console.info(`[reminders] game=${d.gameId} ply=${d.ply} sent=${res.ok}${res.ok ? '' : ` error=${res.error}`}`)
  }
}
