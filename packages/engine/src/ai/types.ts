/**
 * Public AI types. Contract source: docs/AI_API.md (signatures are frozen).
 */
import type { Action } from "../types.js";

/** 1 = 초급, 2 = 중급, 3 = 고급. */
export type AiLevel = 1 | 2 | 3;

export interface AiOptions {
  level: AiLevel;
  /**
   * When given the search is fully reproducible: the wall-clock budget is converted to a
   * node budget so the result never depends on machine speed (docs/DECISIONS.md).
   */
  seed?: number;
  /** Wall-clock budget; per-level defaults apply when omitted (고급 ≈ 1200ms). */
  timeBudgetMs?: number;
}

export interface AiResult {
  /** Always legal for `state` (taken from allLegalActions, re-verified with isLegal). */
  action: Action;
  /** Side-to-move point of view, centi-points (100 = 1 기물점, 졸 = 200). */
  score: number;
  /** Deepest fully completed search depth. */
  depth: number;
  nodes: number;
  elapsedMs: number;
}
