/**
 * Capture-cinematic runtime stage (P3).
 *
 * The cinematic advances at 60fps, so its per-frame values MUST NOT live in
 * React state — a `set()` per frame would re-render the whole match screen.
 * Instead the director (`CinematicDirector`) writes into this mutable
 * singleton once per frame at priority -2, and every consumer (PieceMesh, the
 * effect meshes, the DOM flash overlay) reads it inside its own `useFrame` /
 * rAF loop. React only ever sees the coarse phase, which lives in the zustand
 * store.
 *
 * Presentation layer only: nothing here imports from `src/game` or `engine`.
 */
import type { PieceView, SquareRef } from "../types";

/** docs/SCENES.md 2절 — the common Tier 1 timeline, in cinematic seconds. */
export const T = {
  /** 이동 완료, 입력 잠금, 암전 시작, 연출 카메라 전환 */
  start: 0,
  /** 소환진 전개 + 각인 발광 */
  sigil: 0.3,
  /** 공격 실행 (Tier 2 교체 구간) */
  attack: 0.8,
  /** 타격 — 히트스톱 / 플래시 / 충격파 / 파티클 */
  impact: 1.2,
  /** 피격 기물 디졸브 소멸 */
  dissolve: 1.5,
  /** 암전 해제, 카메라 복귀 */
  restore: 2.3,
  /** 입력 잠금 해제 */
  end: 2.8,
} as const;

/** 히트스톱 — 타격 순간 연출 시간이 멈춘다 (SCENES.md 1절: 80~120ms). */
export const HITSTOP = 0.1;

/** Wall-clock length of one cinematic (timeline + the frozen hitstop). */
export const DURATION = T.end + HITSTOP;

/** Wall-clock → cinematic time (frozen for HITSTOP seconds at the impact). */
export function stageTime(raw: number): number {
  if (raw <= T.impact) return raw;
  if (raw < T.impact + HITSTOP) return T.impact;
  return raw - HITSTOP;
}

/** How far in front of the victim the attacker stages before it strikes. */
export const STAGE_GAP = 1.15;
/** Gap left between the two pieces at the moment of impact. */
export const STRIKE_GAP = 0.2;

/* ------------------------------------------------------------------ */
/* Plan                                                                */
/* ------------------------------------------------------------------ */

/**
 * Everything the cinematic needs, built once by the store when a capture is
 * applied. `victim` has already been removed from the engine board, so the
 * scene renders it as a ghost for the duration.
 */
export interface CinematicPlan {
  /** history index of the capturing action — strictly increasing */
  seq: number;
  /** the capturing piece (engine state already has it standing on `to`) */
  attacker: PieceView;
  /** the captured piece, kept alive purely for the dissolve */
  victim: PieceView;
  from: SquareRef;
  to: SquareRef;
  /** which Tier 2 attack fills the 0.8s slot (P4 swaps this) */
  variant: string;
}

/* ------------------------------------------------------------------ */
/* Runtime                                                             */
/* ------------------------------------------------------------------ */

export interface StageRuntime {
  /** true between the capture and the end of the cinematic */
  active: boolean;
  /** cinematic time (hitstop-frozen) */
  t: number;
  /** wall-clock time since the cinematic started */
  raw: number;
  /** true while the world is frozen at the impact */
  frozen: boolean;

  /** id of the capturing piece — PieceMesh hands its transform over */
  attackerId: string | null;
  attackerPos: [number, number, number];
  /** extra emissive gain on the attacker, 0..~1.6 */
  awaken: number;

  /** victim ghost world position (knockback included) */
  victimPos: [number, number, number];

  /** 0..1 ambient darkening */
  dim: number;
  /** 0..1 full-screen impact flash */
  flash: number;
  /** 0..1 camera shake trauma */
  trauma: number;

  /** 혈흔 표현 on/off (PRD 2절, SCENES.md 4절) */
  gore: boolean;
}

export const stage: StageRuntime = {
  active: false,
  t: 0,
  raw: 0,
  frozen: false,
  attackerId: null,
  attackerPos: [0, 0, 0],
  awaken: 0,
  victimPos: [0, 0, 0],
  dim: 0,
  flash: 0,
  trauma: 0,
  gore: true,
};

export function resetStage(): void {
  stage.active = false;
  stage.t = 0;
  stage.raw = 0;
  stage.frozen = false;
  stage.attackerId = null;
  stage.attackerPos[0] = 0;
  stage.attackerPos[1] = 0;
  stage.attackerPos[2] = 0;
  stage.awaken = 0;
  stage.victimPos[0] = 0;
  stage.victimPos[1] = 0;
  stage.victimPos[2] = 0;
  stage.dim = 0;
  stage.flash = 0;
  stage.trauma = 0;
}

/* ------------------------------------------------------------------ */
/* Small math helpers (shared by every effect)                         */
/* ------------------------------------------------------------------ */

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 0 below `a`, 1 above `b`, smooth in between. */
export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp01((v - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

export function easeInQuart(t: number): number {
  const u = clamp01(t);
  return u * u * u * u;
}

export function easeOutBack(t: number): number {
  const u = clamp01(t) - 1;
  return 1 + u * u * ((1.7 + 1) * u + 1.7);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Deterministic PRNG — screenshots have to be reproducible run to run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
