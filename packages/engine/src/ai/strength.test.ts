/**
 * 실력 서열 검증 (docs/AI_API.md 5절 3번).
 * 자가 대국은 반드시 seed 지정 → 노드 예산 모드로 돌아가므로 기기 속도에 관계없이 재현된다.
 * 수 제한(200수)으로 무한 루프를 방지하고, 미종료 판은 물량으로 판정한다.
 */
import { describe, expect, it } from "vitest";
import { applyAction, initialState, isLegal } from "../game.js";
import type { GameState, Side } from "../types.js";
import { materialOf } from "./eval.js";
import { chooseAiAction } from "./index.js";
import type { AiLevel } from "./types.js";

type Verdict = "win" | "draw" | "loss";

interface Match {
  verdict: Verdict;
  plies: number;
  reason: string;
}

function playGame(
  strong: { level: AiLevel; budget: number },
  weak: { level: AiLevel; budget: number },
  strongSide: Side,
  gameSeed: number,
  maxPlies: number,
): Match {
  let s: GameState = initialState();
  let plies = 0;
  while (!s.result && plies < maxPlies) {
    const me = s.turn === strongSide ? strong : weak;
    const r = chooseAiAction(s, { level: me.level, seed: gameSeed * 1013 + plies, timeBudgetMs: me.budget });
    expect(isLegal(s, r.action)).toBe(true);
    s = applyAction(s, r.action);
    plies++;
  }
  if (s.result?.type === "checkmate") {
    return {
      verdict: s.result.winner === strongSide ? "win" : "loss",
      plies,
      reason: `checkmate/${s.result.winner}`,
    };
  }
  if (s.result?.type === "draw") return { verdict: "draw", plies, reason: `draw/${s.result.reason}` };
  // 미종료 → 물량 우세로 판정 (강한 쪽에 유리하게 넘어가지 않도록 동점은 무승부)
  const mine = materialOf(s.board, strongSide);
  const theirs = materialOf(s.board, strongSide === "cho" ? "han" : "cho");
  const verdict: Verdict = mine > theirs ? "win" : mine < theirs ? "loss" : "draw";
  return { verdict, plies, reason: `unfinished ${mine}:${theirs}` };
}

function series(
  strong: { level: AiLevel; budget: number },
  weak: { level: AiLevel; budget: number },
  games: number,
  maxPlies: number,
): { win: number; draw: number; loss: number; log: string[] } {
  let win = 0;
  let draw = 0;
  let loss = 0;
  const log: string[] = [];
  for (let g = 0; g < games; g++) {
    // 선/후를 번갈아 잡아 선수 이점을 상쇄한다.
    const strongSide: Side = g % 2 === 0 ? "cho" : "han";
    const m = playGame(strong, weak, strongSide, 40_000 + g * 7, maxPlies);
    if (m.verdict === "win") win++;
    else if (m.verdict === "draw") draw++;
    else loss++;
    log.push(`g${g} strong=${strongSide} ${m.plies}수 ${m.reason} → ${m.verdict}`);
  }
  return { win, draw, loss, log };
}

describe("[AI G] 실력 서열", () => {
  it("G1: 고급(축소 예산 200ms) vs 초급 10판 — 승+무 ≥ 8", () => {
    const r = series({ level: 3, budget: 200 }, { level: 1, budget: 50 }, 10, 200);
    // eslint-disable-next-line no-console
    console.log(`고급 vs 초급: W${r.win} D${r.draw} L${r.loss}\n  ${r.log.join("\n  ")}`);
    expect(r.win + r.draw).toBeGreaterThanOrEqual(8);
    expect(r.loss).toBeLessThanOrEqual(2);
  }, 300_000);

  it("G2: 중급 vs 초급 6판 — 승+무 ≥ 5 (난이도 단조성)", () => {
    const r = series({ level: 2, budget: 150 }, { level: 1, budget: 50 }, 6, 160);
    // eslint-disable-next-line no-console
    console.log(`중급 vs 초급: W${r.win} D${r.draw} L${r.loss}\n  ${r.log.join("\n  ")}`);
    expect(r.win + r.draw).toBeGreaterThanOrEqual(5);
  }, 300_000);
});
