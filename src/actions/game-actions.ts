/**
 * Server actions for Gomoku. The worker is the only writer of game data
 * (see src/schemas/game-schemas.ts), and every rule lives in
 * src/game/rules.ts so it can be unit-tested without a runtime.
 *
 * These actions run with RBAC off (`tools.*`), so each one authorizes the
 * caller itself: seat ownership is checked against `userId`, which comes from
 * the verified JWT, never from params.
 */
import type { ActionContext, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { bestMove } from '../engine/search'
import { LEVELS, isLevel, type Level } from '../engine/levels'
import { N, checkMove, openDrawOffer, replay, stoneOf, type Color, type GameState, type MoveRow } from '../game/rules'

export const BOT_ID = 'bot'

type Game = {
  mode: 'bot' | 'pvp'
  status: 'waiting' | 'active' | 'finished'
  level?: string
  blackId?: string
  whiteId?: string
  hostId?: string
  winner?: string
  endReason?: string
  /** JSON-encoded cell indices (text column). */
  winLine?: string
  moveCount?: number
  lastMoveAt?: string
  drawOffer?: string
  drawOfferPly?: number
}
type Seats = Partial<Record<Color, string>>
type Ctx = ActionContext<Env>

const fail = (error: string, code?: string): ActionResult => ({ success: false, error, code })
const other = (c: Color): Color => (c === 'X' ? 'O' : 'X')
const str = (v: unknown) => (typeof v === 'string' ? v : '')

async function loadGame(tools: ActionTools, gameId: string) {
  if (!gameId) return null
  const r = await tools.get<Game>('games', gameId)
  return r.success ? r.data.record.data : null
}

async function loadSeats(tools: ActionTools, gameId: string): Promise<Seats> {
  const r = await tools.query<{ color: string; userId: string }>('seats', { where: { gameId }, limit: 4 })
  const seats: Seats = {}
  if (r.success) for (const s of r.data.records) seats[s.data.color as Color] = s.data.userId
  return seats
}

async function loadState(tools: ActionTools, gameId: string): Promise<GameState> {
  const r = await tools.query<MoveRow>('moves', {
    where: { gameId },
    orderBy: 'ply',
    orderDir: 'asc',
    limit: N * N + 5,
  })
  return replay(r.success ? r.data.records.map((m) => m.data) : [])
}

/** Append one move (atomic per ply) and update the game index. */
async function commitMove(
  tools: ActionTools,
  gameId: string,
  state: GameState,
  idx: number,
  byId: string,
  stats: { nodes?: number; depth?: number } = {},
): Promise<ActionResult<{ ply: number; winner: string | null; next: GameState }>> {
  const created = await tools.create('moves', {
    gameId,
    ply: state.ply,
    idx,
    stone: state.toMove,
    byId,
    nodes: stats.nodes ?? 0,
    depth: stats.depth ?? 0,
  })
  if (!created.success) {
    // uniqueOn(gameId, ply) refused it: another request already played this ply.
    return /Duplicate/.test(created.error)
      ? { success: false, code: 'stale', error: 'The board changed — that move was already played.' }
      : { success: false, error: created.error }
  }
  // Rebuild from the authoritative log rather than trusting local arithmetic.
  const after = await loadState(tools, gameId)
  const patch: Partial<Game> = { moveCount: after.ply, lastMoveAt: new Date().toISOString() }
  if (after.winner) {
    patch.status = 'finished'
    patch.winner = after.winner
    patch.endReason = after.winner === 'draw' ? 'full' : 'five'
    patch.winLine = JSON.stringify(after.winLine ?? [])
  }
  await tools.update('games', gameId, patch)
  return { success: true, data: { ply: state.ply, winner: after.winner, next: after } }
}

/** Let the engine play if it is the bot's turn. */
async function playBotTurn(tools: ActionTools, gameId: string, game: Game, seats: Seats, state: GameState) {
  if (game.mode !== 'bot' || state.winner || seats[state.toMove] !== BOT_ID) return null
  const level: Level = isLevel(game.level) ? game.level : 'medium'
  const cfg = LEVELS[level]
  const { move, stats } = bestMove(state.board, N, stoneOf(state.toMove), {
    maxDepth: cfg.maxDepth,
    maxNodes: cfg.maxNodes,
    evalFn: cfg.eval,
  })
  if (!move) return null
  console.info(
    `[engine] game=${gameId} level=${level} depth=${stats.depthReached} nodes=${stats.nodes} capped=${stats.timedOut}`,
  )
  return commitMove(tools, gameId, state, move.row * N + move.col, BOT_ID, {
    nodes: stats.nodes,
    depth: stats.depthReached,
  })
}

export async function createGame({ userId, params, tools }: Ctx): Promise<ActionResult> {
  const mode = params.mode === 'pvp' ? 'pvp' : 'bot'
  const level: Level = isLevel(params.level) ? params.level : 'medium'
  const pick = str(params.color)
  const myColor: Color = pick === 'X' || pick === 'O' ? pick : Math.random() < 0.5 ? 'X' : 'O'
  const opp = other(myColor)

  const seats: Seats = { [myColor]: userId }
  if (mode === 'bot') seats[opp] = BOT_ID
  const game: Game = {
    mode,
    status: mode === 'bot' ? 'active' : 'waiting',
    level: mode === 'bot' ? level : '',
    blackId: seats.X ?? '',
    whiteId: seats.O ?? '',
    hostId: userId,
    winner: '',
    endReason: '',
    winLine: '',
    moveCount: 0,
    lastMoveAt: new Date().toISOString(),
  }
  const created = await tools.create('games', game)
  if (!created.success) return fail(created.error)
  const gameId = created.data.recordId
  for (const [color, uid] of Object.entries(seats)) {
    const s = await tools.create('seats', { gameId, color, userId: uid })
    if (!s.success) return fail(s.error)
  }
  // Engine plays black: make its opening move now.
  if (mode === 'bot' && opp === 'X') await playBotTurn(tools, gameId, game, seats, await loadState(tools, gameId))
  return { success: true, data: { gameId } }
}

export async function joinGame({ userId, params, tools }: Ctx): Promise<ActionResult> {
  const gameId = str(params.gameId)
  const game = await loadGame(tools, gameId)
  if (!game) return fail('Game not found.', 'not_found')
  if (game.mode !== 'pvp') return fail('This is a game against the engine.', 'not_pvp')
  const seats = await loadSeats(tools, gameId)
  if (seats.X === userId || seats.O === userId) return { success: true, data: { gameId, already: true } }
  const open: Color | null = !seats.X ? 'X' : !seats.O ? 'O' : null
  if (!open || game.status !== 'waiting') return fail('Both seats are taken — you can still watch.', 'full')
  const s = await tools.create('seats', { gameId, color: open, userId })
  if (!s.success) {
    return /Duplicate/.test(s.error) ? fail('Someone else just took that seat.', 'full') : fail(s.error)
  }
  await tools.update('games', gameId, {
    status: 'active',
    ...(open === 'X' ? { blackId: userId } : { whiteId: userId }),
    lastMoveAt: new Date().toISOString(),
  })
  return { success: true, data: { gameId, color: open } }
}

export async function move({ userId, params, tools }: Ctx): Promise<ActionResult> {
  const gameId = str(params.gameId)
  const row = Number(params.row)
  const col = Number(params.col)
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= N || col >= N)
    return fail('That cell is off the board.', 'bad_cell')
  const game = await loadGame(tools, gameId)
  if (!game) return fail('Game not found.', 'not_found')
  if (game.status === 'finished') return fail('The game is already over.', 'game_over')
  const [seats, state] = await Promise.all([loadSeats(tools, gameId), loadState(tools, gameId)])
  const idx = row * N + col
  const check = checkMove(state, seats, userId, idx)
  if (!check.ok) return fail(check.error, check.code)

  const mine = await commitMove(tools, gameId, state, idx, userId)
  if (!mine.success) return mine
  // The human's stone is already broadcast to every client by the create
  // above; the engine's reply (if any) follows in this same request.
  const bot = await playBotTurn(tools, gameId, game, seats, mine.data.next)
  return {
    success: true,
    data: { ply: mine.data.ply, winner: bot?.success ? bot.data.winner : mine.data.winner },
  }
}

/** Recovery path: nudge the engine if a previous request died before it replied. */
export async function botMove({ userId, params, tools }: Ctx): Promise<ActionResult> {
  const gameId = str(params.gameId)
  const game = await loadGame(tools, gameId)
  if (!game || game.mode !== 'bot' || game.status !== 'active') return fail('Nothing to do.', 'noop')
  const seats = await loadSeats(tools, gameId)
  if (seats.X !== userId && seats.O !== userId) return fail('Only the player can do that.', 'not_a_player')
  const res = await playBotTurn(tools, gameId, game, seats, await loadState(tools, gameId))
  return res ?? { success: true, data: { played: false } }
}

export async function resign({ userId, params, tools }: Ctx): Promise<ActionResult> {
  const gameId = str(params.gameId)
  const game = await loadGame(tools, gameId)
  if (!game) return fail('Game not found.', 'not_found')
  if (game.status === 'finished') return fail('The game is already over.', 'game_over')
  const seats = await loadSeats(tools, gameId)
  const myColor: Color | null = seats.X === userId ? 'X' : seats.O === userId ? 'O' : null
  if (!myColor) return fail('Only the players can resign.', 'not_a_player')
  const cancel = game.status === 'waiting'
  await tools.update('games', gameId, {
    status: 'finished',
    winner: cancel ? '' : other(myColor),
    endReason: cancel ? 'cancelled' : 'resign',
  })
  return { success: true, data: { gameId } }
}

/**
 * Shared checks for draw offers: a live two-player game, and the caller holds a
 * seat. Returns the position from the move log so the offer can be pinned to a ply.
 */
async function loadDrawContext(tools: ActionTools, userId: string, gameId: string) {
  const game = await loadGame(tools, gameId)
  if (!game) return fail('Game not found.', 'not_found')
  if (game.mode !== 'pvp') return fail("The engine doesn't take draw offers.", 'not_pvp')
  if (game.status === 'finished') return fail('The game is already over.', 'game_over')
  if (game.status !== 'active') return fail('Wait for your opponent to join.', 'waiting')
  const [seats, state] = await Promise.all([loadSeats(tools, gameId), loadState(tools, gameId)])
  const me: Color | null = seats.X === userId ? 'X' : seats.O === userId ? 'O' : null
  if (!me) return fail('Only the players can do that.', 'not_a_player')
  if (state.winner) return fail('The game is already over.', 'game_over')
  return { game, state, me, standing: openDrawOffer(game.drawOffer, game.drawOfferPly, state.ply) }
}

export async function offerDraw({ userId, params, tools }: Ctx): Promise<ActionResult> {
  const gameId = str(params.gameId)
  const ctx = await loadDrawContext(tools, userId, gameId)
  if ('success' in ctx) return ctx
  if (ctx.standing === ctx.me) return { success: true, data: { already: true } }
  if (ctx.standing) return fail('Your opponent has already offered a draw. Accept or decline it.', 'offer_pending')
  await tools.update('games', gameId, { drawOffer: ctx.me, drawOfferPly: ctx.state.ply })
  return { success: true, data: { ply: ctx.state.ply } }
}

export async function respondDraw({ userId, params, tools }: Ctx): Promise<ActionResult> {
  const gameId = str(params.gameId)
  const ctx = await loadDrawContext(tools, userId, gameId)
  if ('success' in ctx) return ctx
  if (!ctx.standing || ctx.standing === ctx.me) return fail('There is no draw offer to answer.', 'no_offer')
  const accept = params.accept === true
  const patch: Partial<Game> = accept
    ? { status: 'finished', winner: 'draw', endReason: 'agreed', drawOffer: '' }
    : { drawOffer: '' }
  await tools.update('games', gameId, patch)
  return { success: true, data: { accepted: accept } }
}
