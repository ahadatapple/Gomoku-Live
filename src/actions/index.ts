import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { botMove, createGame, joinGame, move, resign } from './game-actions'

export const actions: Record<string, ActionHandler<Env>> = {
  createGame,
  joinGame,
  move,
  botMove,
  resign,
}
