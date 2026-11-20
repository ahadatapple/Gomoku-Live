import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { botMove, createGame, joinGame, move, offerDraw, resign, respondDraw } from './game-actions'
import { reviewGame } from './coach'
import { setEmailTurns } from './prefs'

export const actions: Record<string, ActionHandler<Env>> = {
  createGame,
  joinGame,
  move,
  botMove,
  resign,
  offerDraw,
  respondDraw,
  reviewGame,
  setEmailTurns,
}
