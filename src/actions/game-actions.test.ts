/**
 * Action-level tests against an in-memory stand-in for the RecordRoom tools.
 * The fake enforces `uniqueOn` exactly like RecordRoom does (check + insert
 * with no await in between), so the race tests exercise the real guard logic.
 */
import { describe, expect, it } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import { fakeTools } from './fake-tools'
import { botMove, createGame, joinGame, move, resign } from './game-actions'

const call = (fn: typeof move, tools: ActionTools, userId: string, params: Record<string, unknown>) =>
  fn({ userId, params, tools, env: {} as never, callerJwt: 'jwt' })

describe('game actions', () => {
  it('plays a bot game: human move then engine reply, both in the log', async () => {
    const { tools, db } = fakeTools()
    const g = await call(createGame, tools, 'alice', { mode: 'bot', color: 'X', level: 'medium' })
    expect(g.success).toBe(true)
    const gameId = (g.data as { gameId: string }).gameId
    const r = await call(move, tools, 'alice', { gameId, row: 7, col: 7 })
    expect(r.success).toBe(true)
    expect(db.moves.map((m) => [m.data.ply, m.data.stone, m.data.byId])).toEqual([
      [0, 'X', 'alice'],
      [1, 'O', 'bot'],
    ])
    expect(db.games[0].data.moveCount).toBe(2)
  })

  it('engine opens when the human takes white', async () => {
    const { tools, db } = fakeTools()
    await call(createGame, tools, 'alice', { mode: 'bot', color: 'O', level: 'easy' })
    expect(db.moves).toHaveLength(1)
    expect(db.moves[0].data).toMatchObject({ ply: 0, stone: 'X', byId: 'bot', idx: 7 * 15 + 7 })
  })

  it('rejects out-of-turn, occupied, off-board, and non-player moves', async () => {
    const { tools } = fakeTools()
    const g = await call(createGame, tools, 'alice', { mode: 'pvp', color: 'X' })
    const gameId = (g.data as { gameId: string }).gameId
    expect(await call(move, tools, 'alice', { gameId, row: 7, col: 7 })).toMatchObject({ code: 'waiting' })
    await call(joinGame, tools, 'bob', { gameId })
    expect(await call(move, tools, 'bob', { gameId, row: 7, col: 7 })).toMatchObject({ code: 'not_your_turn' })
    expect(await call(move, tools, 'eve', { gameId, row: 7, col: 7 })).toMatchObject({ code: 'not_a_player' })
    expect(await call(move, tools, 'alice', { gameId, row: 15, col: 0 })).toMatchObject({ code: 'bad_cell' })
    expect((await call(move, tools, 'alice', { gameId, row: 7, col: 7 })).success).toBe(true)
    expect(await call(move, tools, 'bob', { gameId, row: 7, col: 7 })).toMatchObject({ code: 'occupied' })
  })

  it('detects five in a row and closes the game', async () => {
    const { tools, db } = fakeTools()
    const g = await call(createGame, tools, 'alice', { mode: 'pvp', color: 'X' })
    const gameId = (g.data as { gameId: string }).gameId
    await call(joinGame, tools, 'bob', { gameId })
    for (let c = 0; c < 4; c++) {
      await call(move, tools, 'alice', { gameId, row: 7, col: c })
      await call(move, tools, 'bob', { gameId, row: 8, col: c })
    }
    const win = await call(move, tools, 'alice', { gameId, row: 7, col: 4 })
    expect(win).toMatchObject({ success: true, data: { winner: 'X' } })
    expect(db.games[0].data).toMatchObject({ status: 'finished', winner: 'X', endReason: 'five' })
    expect(JSON.parse(db.games[0].data.winLine as string)).toEqual([105, 106, 107, 108, 109])
    expect(await call(move, tools, 'bob', { gameId, row: 9, col: 9 })).toMatchObject({ code: 'game_over' })
  })

  it('a double-submitted move lands exactly once', async () => {
    const { tools, db } = fakeTools()
    const g = await call(createGame, tools, 'alice', { mode: 'pvp', color: 'X' })
    const gameId = (g.data as { gameId: string }).gameId
    await call(joinGame, tools, 'bob', { gameId })
    const [a, b] = await Promise.all([
      call(move, tools, 'alice', { gameId, row: 7, col: 7 }),
      call(move, tools, 'alice', { gameId, row: 3, col: 3 }),
    ])
    expect([a.success, b.success].filter(Boolean)).toHaveLength(1)
    expect([a, b].find((r) => !r.success)).toMatchObject({ code: 'stale' })
    expect(db.moves).toHaveLength(1)
  })

  it('two joiners racing for one seat: one wins, one is told it is full', async () => {
    const { tools, db } = fakeTools()
    const g = await call(createGame, tools, 'alice', { mode: 'pvp', color: 'X' })
    const gameId = (g.data as { gameId: string }).gameId
    const [b, c] = await Promise.all([
      call(joinGame, tools, 'bob', { gameId }),
      call(joinGame, tools, 'carol', { gameId }),
    ])
    expect([b.success, c.success].filter(Boolean)).toHaveLength(1)
    expect(db.seats).toHaveLength(2)
  })

  it('resign awards the other colour; only players may resign', async () => {
    const { tools, db } = fakeTools()
    const g = await call(createGame, tools, 'alice', { mode: 'pvp', color: 'X' })
    const gameId = (g.data as { gameId: string }).gameId
    await call(joinGame, tools, 'bob', { gameId })
    expect(await call(resign, tools, 'eve', { gameId })).toMatchObject({ code: 'not_a_player' })
    await call(resign, tools, 'bob', { gameId })
    expect(db.games[0].data).toMatchObject({ status: 'finished', winner: 'X', endReason: 'resign' })
  })

  it('botMove is a no-op when it is the human to move', async () => {
    const { tools, db } = fakeTools()
    const g = await call(createGame, tools, 'alice', { mode: 'bot', color: 'X' })
    const gameId = (g.data as { gameId: string }).gameId
    expect((await call(botMove, tools, 'alice', { gameId })).success).toBe(true)
    expect(db.moves ?? []).toHaveLength(0)
  })
})
