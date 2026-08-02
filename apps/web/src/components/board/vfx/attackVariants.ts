/**
 * Attack-variant registry — the P4 extension slot.
 *
 * The Tier 1 cinematic (docs/SCENES.md 2절) is fixed everywhere *except* the
 * 0.8s~1.2s attack window. That window is defined entirely by an
 * `AttackVariant`: how the attacking piece moves, how hot it glows, and what
 * extra 3D content is mounted alongside it.
 *
 * P3 ships exactly one variant — `lunge` (전방 돌진), the documented default.
 * P4 registers six more and maps piece types onto them by editing
 * `PIECE_VARIANT` below; nothing else in the cinematic has to change.
 *
 *   registerAttackVariant({ id: "spear", offset: ..., Extras: SpearBeam });
 *   PIECE_VARIANT.soldier = "spear";
 */
import type { ComponentType } from "react";
import type { PieceType } from "../types";
import { type CinematicPlan, easeInQuart, easeOutCubic } from "./stage";

export interface AttackContext {
  /** 0→1 progress through the attack window (T.attack → T.impact) */
  k: number;
  /** cinematic time in seconds */
  t: number;
  /** unit vector attacker → victim, on the XZ plane */
  dir: readonly [number, number, number];
  /** world distance the attacker may cover before it touches the victim */
  reach: number;
}

export interface AttackExtrasProps {
  plan: CinematicPlan;
  /** attacker → victim unit vector (XZ) */
  dir: readonly [number, number, number];
  /** world position of the staged attacker (before it lunges) */
  origin: readonly [number, number, number];
  /** world position of the victim */
  target: readonly [number, number, number];
  /**
   * 저사양 모드 (P6). 변주가 자체 파티클 이미터를 들고 있으면 개수를 절반
   * 이하로 줄인다 — 지오메트리/셰이더 연출은 그대로 둔다 (연출의 정체성이
   * 사라지면 "저사양"이 아니라 "다른 연출"이 되기 때문).
   */
  lowSpec?: boolean;
}

export interface AttackVariant {
  id: string;
  /** shown in DECISIONS/debug only */
  label: string;
  /** World offset from the staging position. Called every frame while attacking. */
  offset(ctx: AttackContext): [number, number, number];
  /** Extra emissive gain on the attacker during the window (0..1). */
  awaken?(ctx: AttackContext): number;
  /**
   * Multiplier on the impact camera shake. A 상 내려찍기 has to feel heavier
   * than a 졸 창격 even though both share the Tier 1 impact beat.
   */
  traumaScale?: number;
  /**
   * World-space height added to the cinematic camera *and* its look target, so
   * an attack that leaves the ground can be followed (SCENES.md 3절 마: "카메라
   * 상향 추적"). Returns to 0 by the impact or the shot snaps back.
   */
  cameraLift?(ctx: AttackContext): number;
  /** Optional extra scene content, mounted for the whole cinematic. */
  Extras?: ComponentType<AttackExtrasProps>;
}

/** 기본값 — 공격 기물이 피격 기물 쪽으로 짧게 돌진한다 (SCENES.md 2절 0.8s). */
const lunge: AttackVariant = {
  id: "lunge",
  label: "전방 돌진",
  offset({ k, dir, reach }) {
    // wind up (slight pull back), then snap forward on an ease-in curve
    const wind = -0.16 * Math.sin(Math.PI * Math.min(1, k / 0.42));
    const push = easeInQuart(Math.max(0, (k - 0.28) / 0.72));
    const along = wind + push * reach;
    const hop = Math.sin(Math.PI * easeOutCubic(k)) * 0.09;
    return [dir[0] * along, hop, dir[2] * along];
  },
  awaken({ k }) {
    return 0.35 + 0.65 * k;
  },
};

const registry = new Map<string, AttackVariant>([[lunge.id, lunge]]);

export const DEFAULT_VARIANT = lunge.id;

/** P4 hook: add a variant, then point piece types at it via `PIECE_VARIANT`. */
export function registerAttackVariant(variant: AttackVariant): void {
  registry.set(variant.id, variant);
}

/**
 * 기물 타입 → 연출 id. Empty in P3 (everything falls back to 전방 돌진);
 * P4 fills all seven entries.
 */
export const PIECE_VARIANT: Partial<Record<PieceType, string>> = {};

export function variantIdFor(type: PieceType): string {
  const id = PIECE_VARIANT[type];
  return id && registry.has(id) ? id : DEFAULT_VARIANT;
}

export function getAttackVariant(id: string): AttackVariant {
  return registry.get(id) ?? lunge;
}
