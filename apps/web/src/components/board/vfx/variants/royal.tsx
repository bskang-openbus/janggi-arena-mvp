"use client";

/**
 * 궁 — 왕의 위엄 (포획판).
 *
 * docs/SCENES.md 3절 assigns 궁 the 외통 승리 연출 (see `VictoryOverlay`), but a
 * 궁 *can* capture — only inside its own palace, and only when an enemy has
 * walked in. That is rare enough to deserve its own beat rather than falling
 * back to the generic 전방 돌진, so the gate's "7종이 서로 다르다" holds for
 * captures too.
 *
 * Concept: the king does not charge. A judgment sigil descends and a pillar of
 * light annihilates the intruder.
 */
import { SIDE_THEME } from "../../palette";
import { getGlowTexture } from "../../textures";
import type { AttackExtrasProps, AttackVariant } from "../attackVariants";
import { Fx, layFlat } from "../fx";
import { clamp01, easeOutCubic, smoothstep, T } from "../stage";
import { getSigilTexture } from "../vfxTextures";

const DESCEND = 0.45;

function RoyalExtras({ plan, target }: AttackExtrasProps) {
  const theme = SIDE_THEME[plan.attacker.side];
  const sigil = getSigilTexture();
  const glow = getGlowTexture();
  const span = T.impact - T.attack;

  return (
    <group>
      {/* 심판의 문양 — opens overhead, then presses down onto the intruder */}
      <Fx
        color="#ffe6a8"
        map={sigil}
        drive={(t, mesh, mat) => {
          const k = (t - T.attack) / span;
          if (k < -0.5) return;
          const drop = easeOutCubic(clamp01((k - DESCEND) / (1 - DESCEND)));
          mesh.position.set(target[0], 2.2 - drop * 2.13, target[2]);
          layFlat(mesh, t * 1.5);
          mesh.scale.setScalar(
            (0.5 + easeOutCubic(clamp01((k + 0.45) / 0.6)) * 0.75) *
              (1 + drop * 0.5),
          );
          mat.opacity =
            smoothstep(-0.5, -0.1, k) * (0.5 + drop * 0.5) *
            (1 - smoothstep(T.impact + 0.2, T.impact + 0.7, t));
        }}
      >
        <planeGeometry args={[2, 2]} />
      </Fx>

      {/* 광휘의 기둥 */}
      <Fx
        color="#fff2cf"
        drive={(t, mesh, mat) => {
          const a = t - T.impact;
          if (a < -0.06) return;
          mesh.position.set(target[0], 1.5, target[2]);
          const grow = easeOutCubic(clamp01((a + 0.06) / 0.12));
          mesh.scale.set(grow, 1, grow);
          mat.opacity =
            grow * (1 - smoothstep(0.1, 0.7, a)) * 0.62;
        }}
      >
        <cylinderGeometry args={[0.3, 0.44, 3, 20, 1, true]} />
      </Fx>

      {/* 발밑 후광 */}
      <Fx
        color={theme.accentHot}
        map={glow}
        drive={(t, mesh, mat) => {
          const a = t - T.impact;
          if (a < 0) return;
          mesh.position.set(target[0], 0.018, target[2]);
          layFlat(mesh);
          mesh.scale.setScalar(1.4 + easeOutCubic(clamp01(a / 0.4)) * 2.2);
          mat.opacity = (1 - smoothstep(0.15, 0.9, a)) * 0.75;
        }}
      >
        <planeGeometry args={[1, 1]} />
      </Fx>
    </group>
  );
}

export const royal: AttackVariant = {
  id: "royal",
  label: "왕의 위엄",
  traumaScale: 1.6,
  offset({ k, dir, reach }) {
    // a single deliberate step, taken only at the very end
    const step = easeOutCubic(clamp01((k - 0.7) / 0.3)) * reach * 0.45;
    return [dir[0] * step, 0, dir[2] * step];
  },
  awaken: ({ k }) => 0.55 + 0.6 * k,
  Extras: RoyalExtras,
};
