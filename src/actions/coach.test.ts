import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import { fakeTools } from './fake-tools'
import { createGame, joinGame, move } from './game-actions'

const llm = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[], fail: false }))
vi.mock('../server/integrations-call', async (orig) => ({
  ...(await orig<typeof import('../server/integrations-call')>()),
  callIntegrationAsOwner: async (_env: unknown, endpoint: string, body: Record<string, unknown>) => {
    llm.calls.push({ endpoint, ...body })
    await new Promise((r) => setTimeout(r, 5))
    return llm.fail
      ? { ok: false, status: 402, error: 'insufficient_credits' }
      : { ok: true, data: { content: [{ type: 'text', text: 'You won by building an open four.' }] } }
  },
}))
const { reviewGame } = await import('./coach')

const call = (fn: typeof move, tools: ActionTools, userId: string, params: Record<string, unknown>) =>
  fn({ userId, params, tools, env: {} as never, callerJwt: 'jwt' })

async function finishedGame() {
  const { tools, db } = fakeTools()
  const g = await call(createGame, tools, 'alice', { mode: 'pvp', color: 'X' })
  const gameId = (g.data as { gameId: string }).gameId
  await call(joinGame, tools, 'bob', { gameId })
  for (let c = 0; c < 4; c++) {
    await call(move, tools, 'alice', { gameId, row: 7, col: c })
    await call(move, tools, 'bob', { gameId, row: 9, col: c * 2 })
  }
  await call(move, tools, 'alice', { gameId, row: 7, col: 4 })
  return { tools, db, gameId }
}

describe('AI coach', () => {
  beforeEach(() => {
    llm.calls = []
    llm.fail = false
  })

  it('reviews a finished game once, grounded in engine facts', async () => {
    const { tools, db, gameId } = await finishedGame()
    const [a, b] = await Promise.all([
      call(reviewGame, tools, 'bob', { gameId }),
      call(reviewGame, tools, 'bob', { gameId }),
    ])
    expect(a.success && b.success).toBe(true)
    expect(llm.calls).toHaveLength(1) // double-click pays once
    const prompt = JSON.stringify(llm.calls[0])
    expect(llm.calls[0]).toMatchObject({ endpoint: 'anthropic/chat-completion', model: 'claude-haiku-5-5' })
    expect(llm.calls[0].max_tokens).toBeGreaterThanOrEqual(1500) // 450 hit output_budget_exhausted live
    expect(prompt).toContain('you lost')
    expect(prompt).toContain('without blocking the opponent\'s winning point at E8') // engine found Bob's missed block (A8-D8 four, edge-closed)
    expect(db.reviews[0].data).toMatchObject({ status: 'done', text: 'You won by building an open four.' })
  })

  it('refuses spectators and unfinished games', async () => {
    const { tools, gameId } = await finishedGame()
    expect(await call(reviewGame, tools, 'eve', { gameId })).toMatchObject({ code: 'not_a_player' })
    const { tools: t2 } = fakeTools()
    const g = await call(createGame, t2, 'alice', { mode: 'bot', color: 'X' })
    expect(await call(reviewGame, t2, 'alice', { gameId: (g.data as { gameId: string }).gameId })).toMatchObject({
      code: 'not_finished',
    })
    expect(llm.calls).toHaveLength(0)
  })

  it('records a failure and lets the player retry', async () => {
    const { tools, db, gameId } = await finishedGame()
    llm.fail = true
    expect(await call(reviewGame, tools, 'alice', { gameId })).toMatchObject({ code: 'coach_failed' })
    expect(db.reviews[0].data.status).toBe('error')
    llm.fail = false
    expect((await call(reviewGame, tools, 'alice', { gameId })).success).toBe(true)
    expect(db.reviews).toHaveLength(1)
    expect(db.reviews[0].data.status).toBe('done')
  })
})
