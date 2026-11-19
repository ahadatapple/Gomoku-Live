import { sliderEval } from './eval'

/**
 * Bot strength = how much of the search budget the engine gets.
 * These numbers are the depth-vs-latency tradeoff, measured on a 12-stone
 * midgame (Node 22, one core): depth 1 ≈ 30 ms, 2 ≈ 50 ms, 3 ≈ 110 ms,
 * 4 ≈ 950 ms, 5 runs past any budget a player would wait for.
 */
export const LEVELS = {
  easy: { label: 'Easy', maxDepth: 1, budgetMs: 400, eval: sliderEval(0.55) },
  medium: { label: 'Medium', maxDepth: 2, budgetMs: 800, eval: undefined },
  hard: { label: 'Hard', maxDepth: 4, budgetMs: 1500, eval: undefined },
} as const

export type Level = keyof typeof LEVELS
export const isLevel = (v: unknown): v is Level => typeof v === 'string' && v in LEVELS
