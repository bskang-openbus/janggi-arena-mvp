"use client";

/**
 * 차 — 돌진 참격 (docs/SCENES.md 3절).
 * 정식판: 고속 돌진(잔상 트레일) → 교차 지점에서 X자 슬래시 아크 2개.
 */
import { SIDE_THEME } from "../../palette";
import { getGlowTexture } from "../../textures";
import type { AttackExtrasProps, AttackVariant } from "../attackVariants";
import { billboardRoll, Fx, orientY } from "../fx";
import { clamp01, easeInQuart, smoothstep, T } from "../stage";

const GHOSTS = [0.10, 0.19, 0.28, 0.38];
const ARCS = [Math.PI * 0.28, -Math.PI * 0.28];

function ChargeExtras({ plan, dir, origin, target }: AttackExtrasProps) {
  const theme = SIDE_THEME[plan.attacker.side];
  const span = T.impact - T.attack;
  const glow = getGlowTexture();

  return (
    <group>
      {/* 잔상 트레일 — each ghost samples where the chariot was `lag` ago */}
      {GHOSTS.map((lag, i) => (
        <Fx
          key={i}
          color={theme.accent}
          map={glow}
          drive={(t, mesh, mat, camera) => {
            const k = (t - T.attack) / span;
            if (k < lag || t > T.impact + 0.5) return;
            // reconstruct where the chariot stood `lag` earlier — same curve
            // the variant's own `offset` uses, sampled in the past
            const kPast = clamp01(k - lag);
            const d = easeInQuart(Math.max(0, (kPast - 0.28) / 0.72)) * 0.95;
            mesh.position.set(
              origin[0] + dir[0] * d,
              0.22,
              origin[2] + dir[2] * d,
            );
            billboardRoll(mesh, camera, 0);
            const decay = 1 - i / GHOSTS.length;
            const out = 1 - smoothstep(T.impact + 0.12, T.impact + 0.5, t);
            mesh.scale.setScalar(1.1 + decay * 0.5);
            mat.opacity = decay * 0.85 * out * smoothstep(0.28, 0.5, kPast);
          }}
        >
          <planeGeometry args={[0.8, 0.8]} />
        </Fx>
      ))}

      {/* 돌진 궤적 — a streak laid on the board behind the charge */}
      <Fx
        color={theme.accentHot}
        drive={(t, mesh, mat) => {
          const k = (t - T.attack) / span;
          if (k < 0.2) return;
          const midX = (origin[0] + target[0]) / 2;
          const midZ = (origin[2] + target[2]) / 2;
          const len = Math.hypot(target[0] - origin[0], target[2] - origin[2]);
          mesh.position.set(midX, 0.03, midZ);
          orientY(mesh, dir[0], 0, dir[2]);
          mesh.scale.set(1, len * 1.1, 1);
          const out = 1 - smoothstep(T.impact + 0.1, T.impact + 0.6, t);
          mat.opacity = smoothstep(0.2, 0.6, k) * 0.55 * out;
        }}
      >
        <cylinderGeometry args={[0.12, 0.12, 1, 6]} />
      </Fx>

      {/* X자 슬래시 아크 2개 — the cut lands on the victim */}
      {ARCS.map((roll, i) => (
        <Fx
          key={i}
          color="#fff6e2"
          drive={(t, mesh, mat, camera) => {
            const a = t - T.impact - i * 0.06;
            if (a < 0 || a > 0.42) return;
            mesh.position.set(target[0], 0.3, target[2]);
            billboardRoll(mesh, camera, roll);
            const grow = easeInQuart(clamp01(a / 0.14));
            mesh.scale.setScalar(0.5 + grow * 1.35);
            mat.opacity = (1 - smoothstep(0.1, 0.42, a)) * 0.95;
          }}
        >
          <ringGeometry args={[0.52, 0.62, 40, 1, Math.PI * 0.22, Math.PI * 0.62]} />
        </Fx>
      ))}
    </group>
  );
}

export const charge: AttackVariant = {
  id: "charge",
  label: "돌진 참격",
  traumaScale: 1.35,
  offset({ k, dir, reach }) {
    // pulls back hard, then covers the whole gap in the last third
    const wind = -0.22 * Math.sin(Math.PI * Math.min(1, k / 0.36));
    const push = easeInQuart(Math.max(0, (k - 0.28) / 0.72));
    const along = wind + push * reach;
    return [dir[0] * along, 0, dir[2] * along];
  },
  awaken: ({ k }) => 0.45 + 0.75 * k,
  Extras: ChargeExtras,
};
