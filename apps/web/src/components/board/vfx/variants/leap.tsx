"use client";

/**
 * 마 — 도약 강습 (docs/SCENES.md 3절).
 * 정식판: 높이 도약 → 낙하 착지 충격파 + 지면 균열 데칼.
 */
import { SIDE_THEME } from "../../palette";
import { getGlowTexture } from "../../textures";
import type { AttackExtrasProps, AttackVariant } from "../attackVariants";
import { Fx, layFlat } from "../fx";
import { clamp01, easeOutCubic, smoothstep, stage, T } from "../stage";
import { getCrackTexture } from "../vfxTextures";

const APEX = 1.15;

/** Height profile of the jump, 0 → 1 through the attack window. */
function arc(k: number): number {
  return Math.sin(Math.PI * clamp01(k)) * APEX * (1 - clamp01(k) * 0.25);
}

function LeapExtras({ plan, target }: AttackExtrasProps) {
  const theme = SIDE_THEME[plan.attacker.side];
  const glow = getGlowTexture();
  const crack = getCrackTexture();

  return (
    <group>
      {/* 그림자 — tracks the horse and tightens as it falls back down */}
      <Fx
        color="#000000"
        map={glow}
        additive={false}
        drive={(t, mesh, mat) => {
          if (t < T.attack || t > T.impact + 0.25) return;
          const h = Math.max(0, stage.attackerPos[1]);
          mesh.position.set(stage.attackerPos[0], 0.016, stage.attackerPos[2]);
          layFlat(mesh);
          mesh.scale.setScalar(1 + h * 0.75);
          mat.opacity = 0.5 / (1 + h * 1.5);
        }}
      >
        <planeGeometry args={[1, 1]} />
      </Fx>

      {/* 도약 순간 발밑 링 */}
      <Fx
        color={theme.accent}
        drive={(t, mesh, mat) => {
          const k = t - T.attack;
          if (k < 0 || k > 0.4) return;
          mesh.position.set(stage.attackerPos[0], 0.02, stage.attackerPos[2]);
          layFlat(mesh);
          mesh.scale.setScalar(0.4 + easeOutCubic(k / 0.4) * 1.5);
          mat.opacity = (1 - k / 0.4) * 0.7;
        }}
      >
        <ringGeometry args={[0.4, 0.5, 40]} />
      </Fx>

      {/* 착지 충격파 — flatter and wider than the common ring */}
      <Fx
        color="#ffe0a8"
        drive={(t, mesh, mat) => {
          const a = t - T.impact;
          if (a < 0) return;
          const k = clamp01(a / 0.5);
          mesh.position.set(target[0], 0.024, target[2]);
          layFlat(mesh);
          mesh.scale.setScalar(0.25 + easeOutCubic(k) * 4.8);
          mat.opacity = (1 - k) * 0.9;
        }}
      >
        <ringGeometry args={[0.42, 0.49, 56]} />
      </Fx>

      {/* 지면 균열 데칼 — stays through the dissolve */}
      <Fx
        color="#ff9c46"
        map={crack}
        drive={(t, mesh, mat) => {
          const a = t - T.impact;
          if (a < 0) return;
          mesh.position.set(target[0], 0.012, target[2]);
          layFlat(mesh, 0.4);
          mesh.scale.setScalar(0.7 + easeOutCubic(clamp01(a / 0.2)) * 0.85);
          mat.opacity =
            clamp01(a / 0.08) * (1 - smoothstep(0.9, 2.0, a)) * 0.8;
        }}
      >
        <planeGeometry args={[2.4, 2.4]} />
      </Fx>
    </group>
  );
}

export const leap: AttackVariant = {
  id: "leap",
  label: "도약 강습",
  traumaScale: 1.7,
  offset({ k, dir, reach }) {
    // hangs at the apex, then drops hard onto the target
    const along = easeOutCubic(clamp01(k / 0.72)) * reach;
    return [dir[0] * along, arc(k), dir[2] * along];
  },
  awaken: ({ k }) => 0.35 + 0.7 * k,
  // 카메라 상향 추적 — pans up with the jump and settles back by the landing
  cameraLift: ({ k }) => Math.sin(Math.PI * clamp01(k)) * 0.6,
  Extras: LeapExtras,
};
