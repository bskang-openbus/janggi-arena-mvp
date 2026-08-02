/**
 * 외통 승리 연출 런타임 (P4, docs/SCENES.md 3절 궁 항목).
 *
 * A sibling of `stage.ts` rather than a mode of it: the victory cinematic is
 * not a capture, has no attacker or victim, and must be able to run *after* a
 * capture cinematic when the mating move was itself a capture. Keeping the two
 * runtimes separate means neither has to carry a null-check for the other.
 *
 * They share `cinematicClock` (see stage.ts) because they can never be active
 * at the same time, which keeps the test surface to one pause/seek API.
 */
import type { Side, SquareRef } from "../types";

/** 승리 연출 타임라인 (초). */
export const VT = {
  /** 전체 화면 암전 시작 + 슬로모션 카메라 선회 진입 */
  start: 0,
  /** 승자 진영 문양 전개 */
  sigil: 0.4,
  /** "외통" 붓글씨 문구 */
  word: 0.95,
  /** 승자 표기 */
  winner: 1.7,
  /** 결과 오버레이로 인계 */
  end: 3.2,
} as const;

export interface VictoryPlan {
  winner: Side;
  /** square of the mated 궁 — the camera circles it */
  at: SquareRef;
}

export interface VictoryRuntime {
  active: boolean;
  t: number;
  raw: number;
  /** 0..1 full-screen darkening */
  dim: number;
  winner: Side | null;
}

export const victoryStage: VictoryRuntime = {
  active: false,
  t: 0,
  raw: 0,
  dim: 0,
  winner: null,
};

export function resetVictoryStage(): void {
  victoryStage.active = false;
  victoryStage.t = 0;
  victoryStage.raw = 0;
  victoryStage.dim = 0;
  victoryStage.winner = null;
}
