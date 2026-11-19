export type GameRecord = {
  mode: 'bot' | 'pvp'
  status: 'waiting' | 'active' | 'finished'
  level?: string
  blackId?: string
  whiteId?: string
  hostId?: string
  winner?: string
  endReason?: string
  winLine?: number[] | string
  moveCount?: number
  lastMoveAt?: string
}
export type MoveRecord = { gameId: string; ply: number; idx: number; stone: string; byId: string; thinkMs?: number; depth?: number }
export type SeatRecord = { gameId: string; color: 'X' | 'O'; userId: string }
export const BOT_ID = 'bot'
