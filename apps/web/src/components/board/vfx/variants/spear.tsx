"use client";

/**
 * 졸·병 — 창격 (docs/SCENES.md 3절).
 * 정식판: 기물 앞에 빛의 장창 3개가 순차 찌르기 + 관통 라인.
 *
 * The smallest piece on the board, so the attack stays close to home: the
 * soldier barely steps forward and lets three conjured spears do the work.
 */
import { SIDE_THEME } from "../../palette";
import type { AttackExtrasProps, AttackVariant } from "../attackVariants";
import { Fx, orientY } from "../fx";
import { clamp01, easeOutCubic, smoothstep, T } from "../stage";

/**
 * Thrust start times inside the 0.8s~1.2s window, as a fraction of it.
 *
 * Each spear *stays* once it has driven home rather than retracting: three
 * that flash past in sequence never read as "장창 3개" in a still frame, three
 * standing side by side do.
 */
const THRUSTS = [0, 0.2, 0.4];
const THRUST_LEN = 0.45;
/** Lateral spread so the three don't stack into one silhouette. */
const LANE = 0.17;

function SpearExtras({ plan, dir, origin, target }: AttackExtrasProps) {
  const theme = SIDE_THEME[plan.attacker.side];
  const span = T.impact - T.attack;

  return (
    <group>
      {THRUSTS.map((phase, i) => (
        <Fx
          key={i}
          color={i === 2 ? theme.accentHot : theme.accent}
          drive={(t, mesh, mat) => {
            const k = (t - T.attack) / span;
            if (k < phase) return;
            const local = clamp01((k - phase) / THRUST_LEN);

            // slides from just in front of the soldier into the victim…
            const push = easeOutCubic(local);
            const travel = 0.34 + (1.02 - 0.34) * push;
            const lane = (i - 1) * LANE;
            mesh.position.set(
              origin[0] + dir[0] * travel - dir[2] * lane,
              0.24 + i * 0.04,
              origin[2] + dir[2] * travel + dir[0] * lane,
            );
            orientY(mesh, dir[0], 0, dir[2]);
            // …then holds, so all three are planted when the blow lands
            const arrive = 0.55 + 0.45 * Math.sin(Math.PI * local);
            const spent = 1 - smoothstep(T.impact, T.impact + 0.2, t);
            mat.opacity = smoothstep(0, 0.18, local) * arrive * spent;
          }}
        >
          <cylinderGeometry args={[0.016, 0.062, 0.82, 6]} />
        </Fx>
      ))}

      {/* 관통 라인 — the three thrusts resolve into one skewer at the impact */}
      <Fx
        color="#fff3d0"
        drive={(t, mesh, mat) => {
          const a = t - T.impact;
          if (a < 0 || a > 0.34) return;
          const midX = (origin[0] + target[0]) / 2;
          const midZ = (origin[2] + target[2]) / 2;
          const len = Math.hypot(target[0] - origin[0], target[2] - origin[2]);
          mesh.position.set(midX, 0.28, midZ);
          orientY(mesh, dir[0], 0, dir[2]);
          const fade = 1 - smoothstep(0, 0.34, a);
          mesh.scale.set(fade * 1.2 + 0.2, len * 1.5, fade * 1.2 + 0.2);
          mat.opacity = fade * 0.9;
        }}
      >
        <cylinderGeometry args={[0.05, 0.05, 1, 8]} />
      </Fx>
    </group>
  );
}

export const spear: AttackVariant = {
  id: "spear",
  label: "창격",
  traumaScale: 0.8,
  offset({ k, dir, reach }) {
    // a short, sharp step in — the spears carry the distance, not the piece
    const step = easeOutCubic(clamp01((k - 0.5) / 0.5)) * reach * 0.55;
    return [dir[0] * step, 0, dir[2] * step];
  },
  awaken: ({ k }) => 0.4 + 0.6 * k,
  Extras: SpearExtras,
};
