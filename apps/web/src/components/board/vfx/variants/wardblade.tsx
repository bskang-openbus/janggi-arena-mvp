"use client";

/**
 * 사 — 호위검 (docs/SCENES.md 3절).
 * 정식판: 원형 검막(회전하는 빛의 검 4자루) 전개 → 십자 베기 수렴.
 *
 * 사 never leaves the palace, so it never charges: the guard holds its post and
 * the blades do the travelling.
 */
import { SIDE_THEME } from "../../palette";
import type { AttackExtrasProps, AttackVariant } from "../attackVariants";
import { billboardRoll, Fx, orientY } from "../fx";
import { clamp01, easeInQuart, easeOutCubic, smoothstep, T } from "../stage";

const BLADES = [0, 1, 2, 3];
/** Blades orbit until this point, then converge on the victim. */
const CONVERGE = 0.58;
const ORBIT_R = 0.95;

function WardbladeExtras({ plan, target }: AttackExtrasProps) {
  const theme = SIDE_THEME[plan.attacker.side];
  const span = T.impact - T.attack;

  return (
    <group>
      {BLADES.map((i) => (
        <Fx
          key={i}
          color={i % 2 === 0 ? theme.accentHot : theme.accent}
          drive={(t, mesh, mat) => {
            const k = (t - T.attack) / span;
            if (k < -0.5 || t > T.impact + 0.1) return;

            const spin = t * 4.6 + (i / BLADES.length) * Math.PI * 2;
            const pull = easeInQuart(clamp01((k - CONVERGE) / (1 - CONVERGE)));
            const r = ORBIT_R * (1 - pull * 0.94);
            const dx = Math.cos(spin) * r;
            const dz = Math.sin(spin) * r;
            mesh.position.set(target[0] + dx, 0.42 - pull * 0.1, target[2] + dz);
            // blade points inward at the victim
            orientY(mesh, -dx, 0, -dz);
            mat.opacity =
              smoothstep(-0.45, -0.05, k) * (0.55 + pull * 0.45) *
              (1 - smoothstep(T.impact, T.impact + 0.1, t));
          }}
        >
          <cylinderGeometry args={[0.014, 0.05, 0.52, 5]} />
        </Fx>
      ))}

      {/* 검막 링 — the ward the blades are riding */}
      <Fx
        color={theme.accent}
        drive={(t, mesh, mat) => {
          const k = (t - T.attack) / span;
          if (k < -0.5 || t > T.impact + 0.12) return;
          const pull = easeInQuart(clamp01((k - CONVERGE) / (1 - CONVERGE)));
          mesh.position.set(target[0], 0.42, target[2]);
          mesh.rotation.set(-Math.PI / 2, 0, t * 1.6);
          mesh.scale.setScalar(ORBIT_R * (1 - pull * 0.94) + 0.05);
          mat.opacity = smoothstep(-0.45, -0.05, k) * 0.5 *
            (1 - smoothstep(T.impact, T.impact + 0.12, t));
        }}
      >
        <ringGeometry args={[0.94, 1.0, 48]} />
      </Fx>

      {/* 십자 베기 — the two cuts the converging blades resolve into */}
      {[0, Math.PI / 2].map((roll, i) => (
        <Fx
          key={`cut${i}`}
          color="#ffffff"
          drive={(t, mesh, mat, camera) => {
            const a = t - T.impact;
            if (a < 0 || a > 0.3) return;
            mesh.position.set(target[0], 0.34, target[2]);
            billboardRoll(mesh, camera, roll);
            const grow = easeOutCubic(clamp01(a / 0.1));
            mesh.scale.set(grow * 2.1, grow * 0.2 + 0.05, 1);
            mat.opacity = (1 - smoothstep(0.06, 0.3, a)) * 0.95;
          }}
        >
          <planeGeometry args={[1, 1]} />
        </Fx>
      ))}
    </group>
  );
}

export const wardblade: AttackVariant = {
  id: "wardblade",
  label: "호위검",
  traumaScale: 1.0,
  offset({ k, dir, reach }) {
    // holds position, leans in only as the blades converge
    const lean = easeOutCubic(clamp01((k - CONVERGE) / (1 - CONVERGE))) * reach * 0.3;
    return [dir[0] * lean, 0, dir[2] * lean];
  },
  awaken: ({ k }) => 0.5 + 0.5 * k,
  Extras: WardbladeExtras,
};
