"use client";

/**
 * 포 — 포격 (docs/SCENES.md 3절).
 * 정식판: 상공에 포문 문양 전개 → 발광 포탄이 포물선 낙하 → 폭발 링 + 연기 기둥.
 *
 * The only variant where the attacker never closes the distance: 포 jumps a
 * screen to take, so it fires from where it stands and recoils.
 */
import { SIDE_THEME } from "../../palette";
import { getGlowTexture } from "../../textures";
import type { AttackExtrasProps, AttackVariant } from "../attackVariants";
import { billboard, Fx, layFlat } from "../fx";
import { type BurstSpec, ParticleBurst } from "../Particles";
import { clamp01, easeOutCubic, smoothstep, T } from "../stage";
import { getSigilTexture } from "../vfxTextures";

/** The shell is airborne for most of the attack window. */
const LAUNCH = 0.24;
/**
 * Kept low deliberately: the cinematic camera frames a ~1.2 unit duel, so a
 * tall parabola simply leaves the shot. This is high enough to read as a lob.
 */
const ARC_HEIGHT = 0.72;

function BombardExtras({ plan, origin, target }: AttackExtrasProps) {
  const theme = SIDE_THEME[plan.attacker.side];
  const span = T.impact - T.attack;
  const glow = getGlowTexture();
  const sigil = getSigilTexture();

  /** Shell position along its parabola, 0 → 1. */
  const shellAt = (u: number): [number, number, number] => [
    origin[0] + (target[0] - origin[0]) * u,
    0.42 + ARC_HEIGHT * Math.sin(Math.PI * u) * (1 - u * 0.25),
    origin[2] + (target[2] - origin[2]) * u,
  ];

  const smoke: BurstSpec = {
    count: 48,
    origin: [target[0], 0.16, target[2]],
    t0: T.impact,
    life: 1.5,
    stagger: 0.28,
    speedMin: 0.25,
    speedMax: 1.1,
    upBias: 0.92,
    gravity: 0.35,
    drag: 1.9,
    size: 0.24,
    sizeJitter: 0.7,
    colorA: "#2a2622",
    colorB: "#6b6158",
    radius: 0.22,
    seed: 707 + plan.seq,
  };

  return (
    <group>
      {/* 포문 문양 — opens above the cannon before it fires */}
      <Fx
        color={theme.accentHot}
        map={sigil}
        drive={(t, mesh, mat) => {
          const k = (t - T.attack) / span;
          if (k < -0.4) return;
          mesh.position.set(origin[0], 0.8, origin[2]);
          layFlat(mesh, -t * 2.4);
          const open = easeOutCubic(clamp01((k + 0.35) / 0.5));
          mesh.scale.setScalar(open * 0.55);
          const flare = k < LAUNCH ? 1 : Math.exp(-(k - LAUNCH) * 6);
          mat.opacity = open * (0.35 + 0.55 * flare) *
            (1 - smoothstep(T.impact + 0.1, T.impact + 0.5, t));
        }}
      >
        <planeGeometry args={[2, 2]} />
      </Fx>

      {/* 발광 포탄 */}
      <Fx
        color="#ffd98a"
        map={glow}
        drive={(t, mesh, mat, camera) => {
          const k = (t - T.attack) / span;
          if (k < LAUNCH || t > T.impact) return;
          const u = clamp01((k - LAUNCH) / (1 - LAUNCH));
          const [x, y, z] = shellAt(u);
          mesh.position.set(x, y, z);
          billboard(mesh, camera);
          mesh.scale.setScalar(0.62 + u * 0.3);
          mat.opacity = 0.95;
        }}
      >
        <planeGeometry args={[1, 1]} />
      </Fx>

      {/* 폭발 링 — wider and slower than the Tier 1 shockwave */}
      <Fx
        color="#ffb14a"
        drive={(t, mesh, mat) => {
          const a = t - T.impact;
          if (a < 0) return;
          const k = clamp01(a / 0.75);
          mesh.position.set(target[0], 0.02, target[2]);
          layFlat(mesh);
          mesh.scale.setScalar(0.3 + easeOutCubic(k) * 4.4);
          mat.opacity = (1 - k) * 0.85;
        }}
      >
        <ringGeometry args={[0.4, 0.52, 56]} />
      </Fx>

      {/* 연기 기둥 */}
      <ParticleBurst spec={smoke} />
    </group>
  );
}

export const bombard: AttackVariant = {
  id: "bombard",
  label: "포격",
  traumaScale: 1.5,
  offset({ k, dir }) {
    // muzzle recoil only — the shell travels, the piece does not
    const recoil = -0.3 * Math.exp(-Math.max(0, k - LAUNCH) * 9) *
      smoothstep(LAUNCH - 0.06, LAUNCH, k);
    return [dir[0] * recoil, 0, dir[2] * recoil];
  },
  awaken: ({ k }) => (k < LAUNCH ? 0.4 + k * 2 : 1),
  Extras: BombardExtras,
};
