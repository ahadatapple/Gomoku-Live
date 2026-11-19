/**
 * Gomoku collections.
 *
 * Clients can READ everything (spectating works for signed-out visitors too)
 * but can WRITE nothing: every create/update goes through a server action in
 * src/actions/, which validates the move before touching a record. That makes
 * the worker the only writer, and the RBAC below the guarantee that nobody can
 * bypass it with a hand-crafted websocket write.
 *
 * Concurrency: `moves.uniqueOn ['gameId','ply']` and `seats.uniqueOn
 * ['gameId','color']` are checked and inserted synchronously inside the
 * RecordRoom Durable Object, so two requests racing for the same ply or the
 * same seat cannot both succeed. The move log is the source of truth for the
 * board; `games` is a denormalised index for the lobby and leaderboard.
 */
import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

const readOnly: RolePermissions = { read: true, create: false, update: false, delete: false }
const adminAll: RolePermissions = { read: true, create: true, update: true, delete: true }
const readOnlyForClients = { '*': readOnly, viewer: readOnly, member: readOnly, admin: adminAll }

const text = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  storage: 'text' as const,
  interpretation: 'plain',
  ...extra,
})
const num = (name: string) => ({ name, storage: 'number' as const, interpretation: 'plain' })

export const gamesSchema: CollectionSchema = {
  name: 'games',
  columns: [
    text('mode', { interpretation: { kind: 'select', options: ['bot', 'pvp'] }, required: true }),
    text('status', {
      interpretation: { kind: 'select', options: ['waiting', 'active', 'finished'] },
      required: true,
    }),
    text('level', { maxLength: 16 }), // bot strength: easy | medium | hard
    text('blackId', { maxLength: 128 }), // X, moves first; 'bot' for the engine
    text('whiteId', { maxLength: 128 }), // O
    text('hostId', { maxLength: 128 }),
    text('winner', { maxLength: 8 }), // 'X' | 'O' | 'draw' | ''
    text('endReason', { maxLength: 16 }), // five | resign | full
    text('winLine', { interpretation: { kind: 'json' }, maxLength: 200 }),
    num('moveCount'),
    text('lastMoveAt', { interpretation: { kind: 'datetime' } }),
    num('remindedPly'), // last ply a turn-reminder email was sent for
  ],
  permissions: readOnlyForClients,
}

export const movesSchema: CollectionSchema = {
  name: 'moves',
  columns: [
    text('gameId', { required: true, maxLength: 128 }),
    num('ply'),
    num('idx'),
    text('stone', { maxLength: 1 }),
    text('byId', { maxLength: 128 }),
    num('thinkMs'),
    num('depth'),
  ],
  uniqueOn: ['gameId', 'ply'],
  permissions: readOnlyForClients,
}

export const seatsSchema: CollectionSchema = {
  name: 'seats',
  columns: [
    text('gameId', { required: true, maxLength: 128 }),
    text('color', { maxLength: 1 }),
    text('userId', { maxLength: 128 }),
  ],
  uniqueOn: ['gameId', 'color'],
  permissions: readOnlyForClients,
}

/**
 * Cached AI coach reviews, one per (game, player). The `uniqueOn` claim is
 * taken BEFORE the paid LLM call, so a double-click or two tabs pay once.
 */
export const reviewsSchema: CollectionSchema = {
  name: 'reviews',
  columns: [
    text('gameId', { required: true, maxLength: 128 }),
    text('userId', { required: true, maxLength: 128 }),
    text('status', { interpretation: { kind: 'select', options: ['pending', 'done', 'error'] } }),
    text('text', { maxLength: 6000 }),
    text('moments', { interpretation: { kind: 'json' }, maxLength: 6000 }),
    text('error', { maxLength: 500 }),
  ],
  uniqueOn: ['gameId', 'userId'],
  permissions: readOnlyForClients,
}

/** Per-user notification preference (opt-in). Written only by setEmailTurns. */
export const prefsSchema: CollectionSchema = {
  name: 'prefs',
  columns: [text('userId', { required: true, maxLength: 128 }), text('emailTurns', { maxLength: 3 })],
  uniqueOn: ['userId'],
  permissions: readOnlyForClients,
}
