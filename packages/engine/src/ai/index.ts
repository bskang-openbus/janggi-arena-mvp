/**
 * chooseAiAction — the only entry point the web layer uses (docs/AI_API.md).
 * The web calls this inside a Web Worker; the module keeps the engine's zero-dependency rule.
 */
import { isLegal } from "../game.js";
import type { GameState } from "../types.js";
import { EngineError } from "../types.js";
import { DEFAULT_WEIGHTS } from "./eval.js";
import { autoSeed, makeRng } from "./rng.js";
import { searchRoot, type SearchConfig } from "./search.js";
import type { AiLevel, AiOptions, AiResult } from "./types.js";

interface LevelPreset {
  maxDepth: number;
  timeBudgetMs: number;
  quiescence: boolean;
  useTT: boolean;
  temperature: number;
  topK: number;
  jitter: number;
  passPenalty: number;
  contempt: number;
}

/**
 * Difficulty calibration (docs/DECISIONS.md):
 *  - 1 초급: depth 1 only — it grabs free material but never sees the recapture, so it hangs
 *    pieces on its own. softmax(T=110) over the 6 best moves adds genuine mistakes while
 *    keeping the moves plausible. 한수쉼은 큰 페널티로 사실상 배제.
 *  - 2 중급: alpha-beta depth 3 + capture-first ordering, no quiescence (교환 수순의 지평선
 *    효과가 남아 있어 사람과 접전).
 *  - 3 고급: iterative deepening + TT + capture quiescence inside a time budget.
 */
const PRESETS: Record<AiLevel, LevelPreset> = {
  1: { maxDepth: 1, timeBudgetMs: 250, quiescence: false, useTT: false, temperature: 110, topK: 6, jitter: 0, passPenalty: 300, contempt: 900 },
  2: { maxDepth: 3, timeBudgetMs: 600, quiescence: false, useTT: true, temperature: 0, topK: 0, jitter: 25, passPenalty: 60, contempt: 300 },
  3: { maxDepth: 24, timeBudgetMs: 1200, quiescence: true, useTT: true, temperature: 0, topK: 0, jitter: 10, passPenalty: 40, contempt: 150 },
};

/**
 * Node/ms conversion for seeded (reproducible) searches. Deliberately conservative so a
 * seeded call finishes well inside its nominal budget even on a slow machine.
 */
const NODES_PER_MS = 90;

export function chooseAiAction(state: GameState, opts: AiOptions): AiResult {
  const preset = PRESETS[opts.level];
  if (!preset) throw new EngineError(`chooseAiAction: unknown level ${String(opts.level)}`);
  if (state.result) throw new EngineError("chooseAiAction: 이미 끝난 대국");

  const budget = Math.max(1, Math.round(opts.timeBudgetMs ?? preset.timeBudgetMs));
  const deterministic = opts.seed !== undefined;
  const cfg: SearchConfig = {
    maxDepth: preset.maxDepth,
    timeBudgetMs: budget,
    quiescence: preset.quiescence,
    useTT: preset.useTT,
    temperature: preset.temperature,
    topK: preset.topK,
    jitter: preset.jitter,
    passPenalty: preset.passPenalty,
    contempt: preset.contempt,
    weights: DEFAULT_WEIGHTS,
    deterministic,
    nodesPerMs: NODES_PER_MS,
  };
  const rng = makeRng(opts.seed ?? autoSeed());
  const result = searchRoot(state, cfg, rng);
  // Belt and braces: the root list comes from allLegalActions, re-verify anyway.
  if (!isLegal(state, result.action)) {
    throw new EngineError("chooseAiAction: 내부 오류 — 비합법 액션 선택");
  }
  return result;
}

export { DEFAULT_WEIGHTS, MATE, PIECE_VALUE, evaluate, materialOf } from "./eval.js";
export { makeRng } from "./rng.js";
export type { AiLevel, AiOptions, AiResult } from "./types.js";
