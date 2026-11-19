/**
 * AI post-game coach.
 *
 * 1. Authorize: only a seated human player of a finished game.
 * 2. Claim the (gameId, userId) review slot atomically via uniqueOn, so the
 *    paid call happens at most once per player per game.
 * 3. Find the critical moments with the engine (src/game/analysis.ts).
 * 4. Ask Claude to explain ONLY those facts in plain language.
 *
 * Billing: developer-billed (app owner pays). With user billing, every player
 * would need DeepSpace credits before they could see a review, which blocks
 * exactly the people trying the app. Owner cost is bounded instead: sign-in
 * required, players only, finished games only, one review per player per game.
 */
import type { ActionContext, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { analyse, coord, describeMoment, type Moment } from '../game/analysis'
import { replay, type Color, type MoveRow } from '../game/rules'
import { callIntegrationAsOwner, extractText } from '../server/integrations-call'

export const COACH_MODEL = 'claude-haiku-5-5'

type Review = { gameId: string; userId: string; status: string; text?: string; moments?: string; error?: string }

const SYSTEM = `You are a friendly, precise Gomoku coach (freestyle, 15x15, five or more in a row wins).
Columns are A-P without I, left to right; rows are 1-15, bottom to top.
You are given the player's colour, the result, the full move list, and a list of CRITICAL MOMENTS found by a search engine.
Rules:
- Only mention coordinates and move numbers that appear in the input. Never invent a position or a line.
- If the facts list is short, say so honestly rather than inventing mistakes.
- 120-180 words, plain text, no headings, no markdown.
- Structure: one-sentence verdict; then the 2-3 moments that decided the game, each with what happened and what to do instead; end with one habit to practise.
- Speak to the player as "you".`

async function findReview(tools: ActionTools, gameId: string, userId: string) {
  const r = await tools.query<Review>('reviews', { where: { gameId, userId }, limit: 1 })
  return r.success ? (r.data.records[0] ?? null) : null
}

export async function reviewGame({ userId, params, tools, env }: ActionContext<Env>): Promise<ActionResult> {
  const gameId = typeof params.gameId === 'string' ? params.gameId : ''
  const g = await tools.get<{ status: string; mode: string; level?: string; winner?: string; endReason?: string }>('games', gameId)
  if (!g.success) return { success: false, code: 'not_found', error: 'Game not found.' }
  const game = g.data.record.data
  if (game.status !== 'finished' || game.endReason === 'cancelled')
    return { success: false, code: 'not_finished', error: 'Reviews are available once the game is over.' }

  const seats = await tools.query<{ color: Color; userId: string }>('seats', { where: { gameId }, limit: 4 })
  const myColor = seats.success ? seats.data.records.find((s) => s.data.userId === userId)?.data.color : undefined
  if (!myColor) return { success: false, code: 'not_a_player', error: 'Only the players can request a review.' }

  // Claim the slot (atomic). An existing 'done' or 'pending' review is returned as is.
  let reviewId: string
  const claim = await tools.create('reviews', { gameId, userId, status: 'pending', text: '', moments: '', error: '' })
  if (claim.success) {
    reviewId = claim.data.recordId
  } else {
    const existing = await findReview(tools, gameId, userId)
    if (!existing) return { success: false, error: claim.error }
    if (existing.data.status !== 'error') return { success: true, data: { reviewId: existing.recordId, cached: true } }
    reviewId = existing.recordId // retry after a failed attempt
    await tools.update('reviews', reviewId, { status: 'pending', error: '' })
  }

  const mv = await tools.query<MoveRow>('moves', { where: { gameId }, orderBy: 'ply', orderDir: 'asc', limit: 240 })
  const moves = mv.success ? mv.data.records.map((r) => r.data) : []
  const state = replay(moves)
  const moments: Moment[] = analyse(moves, { focus: myColor, engineDepth: 2, maxDisagreements: 3 })

  const result =
    game.winner === 'draw'
      ? 'a draw'
      : game.winner === myColor
        ? `you won${game.endReason === 'resign' ? ' by resignation' : ' with five in a row'}`
        : `you lost${game.endReason === 'resign' ? ' (you resigned)' : ''}`
  const opponent = game.mode === 'bot' ? `the engine on ${game.level ?? 'medium'}` : 'another player'
  const user = [
    `You played ${myColor === 'X' ? 'Black (moves first)' : 'White'} against ${opponent}; ${result} after ${state.ply} moves.`,
    `Move list: ${moves.map((m) => `${m.ply + 1}.${m.stone === 'X' ? 'B' : 'W'}${coord(m.idx)}`).join(' ')}`,
    state.winLine ? `Winning line: ${state.winLine.map(coord).join(' ')}` : '',
    'CRITICAL MOMENTS (from the engine):',
    moments.length ? moments.map((m) => `- ${describeMoment(m)}`).join('\n') : '- none found',
  ]
    .filter(Boolean)
    .join('\n')

  const res = await callIntegrationAsOwner(env, 'anthropic/chat-completion', {
    model: COACH_MODEL,
    max_tokens: 450,
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
  })
  const text = res.ok ? extractText(res.data) : null
  if (!res.ok || !text) {
    const error = res.ok ? 'The coach returned an empty answer.' : res.error.slice(0, 480)
    console.error(`[coach] game=${gameId} failed: ${error}`)
    await tools.update('reviews', reviewId, { status: 'error', error })
    return { success: false, code: 'coach_failed', error: 'The coach is unavailable right now. Try again in a moment.' }
  }
  await tools.update('reviews', reviewId, {
    status: 'done',
    text: text.trim().slice(0, 5900),
    moments: JSON.stringify(moments).slice(0, 5900),
  })
  return { success: true, data: { reviewId } }
}
