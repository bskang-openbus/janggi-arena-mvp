"use client";

/**
 * 상 — 진각 내려찍기 (docs/SCENES.md 3절).
 * 정식판: 거대화 그림자와 함께 상승 → 내려찍기 → 방사형 균열 + 저주파 흔들림(강).
 *
 * The heaviest of the seven: `traumaScale` is the highest in the set, which is
 * what sells "저주파" without any audio.
 */
import { SIDE_THEME } from "../../palette";
import { getGlowTexture } from "../../textures";
import type { AttackExtrasProps, AttackVariant } from "../attackVariants";
import { Fx, layFlat } from "../fx";
import { clamp01, easeInQuart, easeOutCubic, smoothstep, stage, T } from "../stage";
import { getCrackTexture } from "../vfxTextures";

const RISE = 0.62;
const HEIGHT = 0.95;
const SPOKES = [0, 1, 2, 3, 4, 5];

/** Up slowly, down like a hammer. */
function height(k: number): number {
  const u = clamp01(k);
  return u < RISE
    ? easeOutCubic(u / RISE) * HEIGHT
    : HEIGHT * (1 - easeInQuart((u - RISE) / (1 - RISE)));
}

function StompExtras({ plan, target }: AttackExtrasProps) {
  const theme = SIDE_THEME[plan.attacker.side];
  const glow = getGlowTexture();
  const crack = getCrackTexture();

  return (
    <group>
      {/* 거대 그림자 — swells under the elephant as it rears up */}
      <Fx
        color="#000000"
        map={glow}
        additive={false}
        drive={(t, mesh, mat) => {
          if (t < T.attack || t > T.impact + 0.3) return;
          const h = Math.max(0, stage.attackerPos[1]);
          mesh.position.set(stage.attackerPos[0], 0.014, stage.attackerPos[2]);
          layFlat(mesh);
          mesh.scale.setScalar(1.1 + h * 2.4);
          mat.opacity = 0.62 * clamp01(h / 0.25) *
            (1 - smoothstep(T.impact, T.impact + 0.3, t));
        }}
      >
        <planeGeometry args={[1, 1]} />
      </Fx>

      {/* 방사형 균열 — six spokes driven out of the point of impact */}
      {SPOKES.map((i) => {
        const angle = (i / SPOKES.length) * Math.PI * 2 + 0.25;
        return (
          <Fx
            key={i}
            color="#ffa84c"
            drive={(t, mesh, mat) => {
              const a = t - T.impact;
              if (a < 0) return;
              const k = clamp01(a / 0.28);
              const reach = easeOutCubic(k) * 2.5;
              mesh.position.set(
                target[0] + Math.cos(angle) * reach * 0.5,
                0.014,
                target[2] + Math.sin(angle) * reach * 0.5,
              );
              mesh.rotation.set(-Math.PI / 2, 0, -angle);
              mesh.scale.set(reach, 1, 1);
              mat.opacity =
                clamp01(a / 0.05) * (1 - smoothstep(0.5, 1.5, a)) * 0.8;
            }}
          >
            <planeGeometry args={[1, 0.13]} />
          </Fx>
        );
      })}

      {/* 균열 중심부 */}
      <Fx
        color="#ff8a3a"
        map={crack}
        drive={(t, mesh, mat) => {
          const a = t - T.impact;
          if (a < 0) return;
          mesh.position.set(target[0], 0.01, target[2]);
          layFlat(mesh, 1.1);
          mesh.scale.setScalar(0.9 + easeOutCubic(clamp01(a / 0.18)) * 1.1);
          mat.opacity =
            clamp01(a / 0.06) * (1 - smoothstep(0.8, 1.9, a)) * 0.85;
        }}
      >
        <planeGeometry args={[2.4, 2.4]} />
      </Fx>

      {/* 저주파 링 — wide, low and slow */}
      <Fx
        color={theme.accentHot}
        drive={(t, mesh, mat) => {
          const a = t - T.impact;
          if (a < 0) return;
          const k = clamp01(a / 0.85);
          mesh.position.set(target[0], 0.03, target[2]);
          layFlat(mesh);
          mesh.scale.setScalar(0.3 + easeOutCubic(k) * 5.4);
          mat.opacity = (1 - k) * 0.7;
        }}
      >
        <ringGeometry args={[0.44, 0.5, 56]} />
      </Fx>
    </group>
  );
}

export const stomp: AttackVariant = {
  id: "stomp",
  label: "진각 내려찍기",
  traumaScale: 2.1,
  offset({ k, dir, reach }) {
    const along = easeInQuart(clamp01(k / 0.92)) * reach;
    return [dir[0] * along, height(k), dir[2] * along];
  },
  awaken: ({ k }) => 0.3 + 0.8 * easeInQuart(k),
  Extras: StompExtras,
};
