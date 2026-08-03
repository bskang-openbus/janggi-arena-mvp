/**
 * 임시 AI 스텁 (P7) — **packages/engine의 AI 모듈이 머지되면 삭제된다.**
 *
 * 다른 에이전트가 engine에 `chooseAiAction`을 구현하는 동안 웹 쪽 배선
 * (워커 · 스토어 · 연출 · UI · E2E)을 완성할 수 있도록, docs/AI_API.md의
 * `AiResult` 형태를 **그대로** 흉내내는 무작위 합법 수 선택기다.
 *
 * 지키는 것
 *   · 반환 액션은 항상 `allLegalActions`에서 나온 것 → 항상 합법
 *   · 같은 seed + 같은 국면 → 같은 수 (E2E 결정화의 근거)
 *   · depth / nodes 는 레벨별로 그럴듯한 **가짜** 값 (탐색을 하지 않는다)
 *   · score 는 두는 쪽 관점 물량 차 (대한장기협회 통용 점수) — 표시용
 *
 * 지키지 않는 것: 실력. 초급/중급/고급 모두 무작위다. 난이도 캘리브레이션은
 * engine AI의 몫이며, 웹은 `level`을 그대로 전달하는 것까지만 책임진다.
 */
import type { Action, GameState, PieceType } from "engine";
import { allLegalActions } from "engine";
import type { AiLevel, AiOptions, AiResult } from "./types";

/** 레벨별로 보고할 가짜 탐색 깊이 (docs/AI_API.md 난이도 설계 방향의 눈금). */
const FAKE_DEPTH: Record<AiLevel, number> = { 1: 1, 2: 3, 3: 5 };

/** 대한장기협회 통용 기물 점수 (docs/AI_API.md 평가 기초). 궁은 값이 없다. */
const VALUE: Record<PieceType, number> = {
  chariot: 13,
  cannon: 7,
  horse: 5,
  elephant: 3,
  guard: 3,
  soldier: 2,
  general: 0,
};

/** mulberry32 — 32비트 시드 하나로 재현 가능한 균등 난수열. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 국면 → 32비트 해시 (FNV-1a).
 *
 * seed 하나로 한 판 전체가 결정되려면 매 수마다 다른 난수열이 필요하다.
 * 실제 탐색 엔진도 seed는 "동률 후보의 tie-break"에만 쓰고 국면마다 다른
 * 결과를 내므로, 시드에 국면을 섞는 이 방식이 계약과 어긋나지 않는다:
 * 같은 seed + 같은 국면 → 항상 같은 수.
 */
function hashState(state: GameState): number {
  let h = 0x811c9dc5;
  const mix = (code: number) => {
    h ^= code;
    h = Math.imul(h, 0x01000193);
  };
  mix(state.turn === "cho" ? 1 : 2);
  mix(state.history.length + 3);
  for (let rank = 0; rank < state.board.length; rank += 1) {
    const row = state.board[rank];
    if (!row) continue;
    for (let file = 0; file < row.length; file += 1) {
      const piece = row[file];
      mix(rank * 31 + file * 7 + 1);
      if (!piece) continue;
      mix(piece.side === "cho" ? 11 : 23);
      for (let i = 0; i < piece.type.length; i += 1) mix(piece.type.charCodeAt(i));
    }
  }
  return h >>> 0;
}

/** 두는 쪽 관점 물량 차. */
function materialScore(state: GameState): number {
  let score = 0;
  for (const row of state.board) {
    if (!row) continue;
    for (const piece of row) {
      if (!piece) continue;
      score += piece.side === state.turn ? VALUE[piece.type] : -VALUE[piece.type];
    }
  }
  return score;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * docs/AI_API.md의 `chooseAiAction` 시그니처 그대로.
 * 합법 수가 하나도 없는 국면(외통/종료)에서는 `pass`를 돌려준다 — 스토어가
 * 합법성을 한 번 더 확인하므로 판이 깨지지 않는다.
 */
export function chooseAiAction(state: GameState, opts: AiOptions): AiResult {
  const startedAt = now();
  const actions = allLegalActions(state);
  const fallback: Action = { kind: "pass" };

  const seed =
    ((opts.seed ?? Math.floor(Math.random() * 0xffffffff)) ^ hashState(state)) >>> 0;
  const random = mulberry32(seed);

  const action =
    actions.length > 0 ? actions[Math.floor(random() * actions.length)] : fallback;

  const depth = FAKE_DEPTH[opts.level] ?? 1;
  // 가짜 노드 수: 후보 수 × 깊이에 시드 흔들림을 얹어 "탐색한 척" 한다
  const nodes =
    Math.max(1, actions.length) * (depth * 9 + 4) +
    Math.floor(random() * 64);

  return {
    action: action ?? fallback,
    score: materialScore(state),
    depth,
    nodes,
    elapsedMs: now() - startedAt,
  };
}
