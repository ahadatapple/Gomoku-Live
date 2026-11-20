import { sliderEval } from './eval'

/**
 * Bot strength = how many positions the engine may search per move.
 *
 * Measured with uncapped depth-4 search over a full engine-vs-engine game
 * (Node 22, one core, ~8 positions/ms): early moves need 2-13k positions,
 * busy midgames 40-110k (5-15 s). Hard is capped at 12k positions (~1.5 s
 * CPU): it reaches depth 4 in quiet positions and falls back to the deepest
 * depth it completed when the board gets busy. The cap is a position count,
 * not a timer, because Workers' clock is frozen during computation.
 */
export const LEVELS = {
  easy: { label: 'Easy', maxDepth: 1, maxNodes: 2_000, eval: sliderEval(0.55) },
  medium: { label: 'Medium', maxDepth: 2, maxNodes: 6_000, eval: undefined },
  hard: { label: 'Hard', maxDepth: 4, maxNodes: 12_000, eval: undefined },
} as const

export type Level = keyof typeof LEVELS
export const isLevel = (v: unknown): v is Level => typeof v === 'string' && v in LEVELS
