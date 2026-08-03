/**
 * AI 계약 타입 (docs/AI_API.md "타입·함수").
 *
 * 이 파일은 **engine이 export할 시그니처의 거울**이다. packages/engine에 AI
 * 모듈이 머지되면 `ai.worker.ts`의 import 한 줄만 바꾸면 되고, 여기 타입은
 * 구조적으로 동일하므로 그대로 맞물린다 (필요하면 그때 engine 재export로
 * 대체한다).
 *
 * 웹의 다른 코드는 이 파일을 직접 import 하지 않는다 — `aiClient.ts`가
 * 필요한 것만 재export 한다 (AI 참조 격리).
 */
import type { Action, GameState } from "engine";

/** 1=초급, 2=중급, 3=고급 */
export type AiLevel = 1 | 2 | 3;

export interface AiOptions {
  level: AiLevel;
  /** 지정 시 완전 재현 (E2E용). 미지정 시 비결정 */
  seed?: number;
  /** 레벨별 기본값 존재 (고급 ≈ 1200ms 내외) */
  timeBudgetMs?: number;
}

export interface AiResult {
  /** 반드시 합법 (필요 시 pass 포함) */
  action: Action;
  /** 두는 쪽(side-to-move) 관점 평가치 */
  score: number;
  /** 실제 도달 탐색 깊이 */
  depth: number;
  /** 탐색 노드 수 */
  nodes: number;
  elapsedMs: number;
}

export type ChooseAiAction = (state: GameState, opts: AiOptions) => AiResult;

/* ------------------------------------------------------------------ */
/* 워커 메시지 프로토콜 (aiClient ↔ ai.worker)                          */
/* ------------------------------------------------------------------ */

export interface AiRequestMessage {
  id: number;
  /** GameState는 구조적 복제 가능 (positionCounts가 Map이지만 Map도 복제된다) */
  state: GameState;
  opts: AiOptions;
}

export type AiResponseMessage =
  | { id: number; ok: true; result: AiResult }
  | { id: number; ok: false; error: string };
