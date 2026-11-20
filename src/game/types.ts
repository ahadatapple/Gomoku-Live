export type GameRecord = {
  mode: 'bot' | 'pvp'
  status: 'waiting' | 'active' | 'finished'
  level?: string
  blackId?: string
  whiteId?: string
  hostId?: string
  winner?: string
  endReason?: string
  winLine?: string
  moveCount?: number
  lastMoveAt?: string
  drawOffer?: string
  drawOfferPly?: number
}
export type MoveRecord = { gameId: string; ply: number; idx: number; stone: string; byId: string; thinkMs?: number; nodes?: number; depth?: number }
export type SeatRecord = { gameId: string; color: 'X' | 'O'; userId: string }
export const BOT_ID = 'bot'
