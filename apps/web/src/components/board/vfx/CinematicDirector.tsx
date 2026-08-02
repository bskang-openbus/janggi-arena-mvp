"use client";

/**
 * 연출 상태머신의 시간축 + 카메라 리그.
 *
 * Always mounted (even when idle) because the camera still has to fly *back*
 * after a skip. Runs at frame priority -2 so every consumer — OrbitControls
 * (-1), PieceMesh and the effect meshes (0) — sees a fully updated `stage`
 * for the frame it is about to draw.
 *
 * Nothing here writes React state per frame; the only React interaction is the
 * single `onEnd()` call when the timeline runs out.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Vector3 } from "three";
import { getAttackVariant } from "./attackVariants";
import {
  type CinematicPlan,
  cinematicClock,
  clamp01,
  duelGeometry,
  type DuelGeometry,
  DURATION,
  easeOutCubic,
  lerp,
  resetStage,
  smoothstep,
  stage,
  stageTime,
  T,
} from "./stage";

/** How long the camera takes to fly home after a skip. */
const SKIP_RESTORE = 0.36;

interface Shot extends DuelGeometry {
  camPos: Vector3;
  camTarget: Vector3;
}

/**
 * Side-on framing of the duel (SCENES.md 2절 0.0s — "두 기물 측면 줌").
 * The side is chosen to match where the player already is, so the cut never
 * crosses the line and the board stays legible.
 */
function buildShot(plan: CinematicPlan, camera: Vector3): Shot {
  const g = duelGeometry(plan);
  const [dx, , dz] = g.dir;

  // frame the *pair*: halfway between where the attacker strikes from and
  // the square it strikes into
  const camTarget = new Vector3(
    (g.strike[0] + g.to[0]) / 2,
    0.28,
    (g.strike[2] + g.to[2]) / 2,
  );
  let sx = -dz;
  let sz = dx;
  if ((camera.x - camTarget.x) * sx + (camera.z - camTarget.z) * sz < 0) {
    sx = -sx;
    sz = -sz;
  }
  // ~38° above the surface: low enough to stay a "측면 줌", high enough that
  // neighbouring pieces don't stand in front of the duel
  const camPos = new Vector3(
    camTarget.x + sx * 3.2 - dx * 0.25,
    2.6,
    camTarget.z + sz * 3.2 - dz * 0.25,
  );

  return { ...g, camPos, camTarget };
}

export interface CinematicDirectorProps {
  plan: CinematicPlan | null;
  gore: boolean;
  /** orbit pivot the camera returns to */
  homeTarget: readonly [number, number, number];
  /** fired once when the timeline finishes on its own */
  onEnd: () => void;
  /** fired once at 1.5s so the 혈흔 데칼 outlives the cinematic */
  onDecal: () => void;
}

export function CinematicDirector({
  plan,
  gore,
  homeTarget,
  onEnd,
  onDecal,
}: CinematicDirectorProps) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as {
    enabled: boolean;
    target: Vector3;
  } | null;

  const running = useRef(false);
  const shot = useRef<Shot | null>(null);
  const homePos = useRef(new Vector3());
  const homeTgt = useRef(new Vector3());
  const restoreFrom = useRef(new Vector3());
  const restoreLeft = useRef(0);
  const decalFired = useRef(false);

  const tmpA = useMemo(() => new Vector3(), []);
  const tmpB = useMemo(() => new Vector3(), []);

  stage.gore = gore;

  useLayoutEffect(() => {
    if (!plan) {
      if (running.current) {
        // 스킵 — 모든 이펙트 즉시 정리, 카메라만 부드럽게 복귀
        running.current = false;
        restoreFrom.current.copy(camera.position);
        restoreLeft.current = SKIP_RESTORE;
        resetStage();
      }
      return;
    }

    homePos.current.copy(camera.position);
    homeTgt.current.copy(controls?.target ?? new Vector3(...homeTarget));
    shot.current = buildShot(plan, camera.position);
    decalFired.current = false;
    running.current = true;
    restoreLeft.current = 0;

    resetStage();
    stage.active = true;
    stage.gore = gore;
    stage.attackerId = plan.attacker.id;
    stage.attackerPos[0] = shot.current.from[0];
    stage.attackerPos[1] = 0;
    stage.attackerPos[2] = shot.current.from[2];
    stage.victimPos[0] = shot.current.to[0];
    stage.victimPos[1] = 0;
    stage.victimPos[2] = shot.current.to[2];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    if (running.current && shot.current && plan) {
      if (controls) controls.enabled = false;
      const g = shot.current;
      const variant = getAttackVariant(plan.variant);

      // `cinematicClock` is inert unless a test has taken the wheel
      if (cinematicClock.seek !== null) {
        stage.raw = cinematicClock.seek;
        cinematicClock.seek = null;
      } else if (!cinematicClock.manual) {
        stage.raw += dt;
      }
      const t = stageTime(stage.raw);
      stage.t = t;
      stage.frozen = stage.raw > T.impact && stage.raw < T.impact + 0.1;

      /* ── 공격 기물 ─────────────────────────────────────────────── */
      const approach = smoothstep(0, 0.34, t);
      let px = lerp(g.from[0], g.staging[0], approach);
      let py = 0;
      let pz = lerp(g.from[2], g.staging[2], approach);

      if (t >= T.attack) {
        const k = clamp01((t - T.attack) / (T.impact - T.attack));
        const off = variant.offset({ k, t, dir: g.dir, reach: g.reach });
        px = g.staging[0] + off[0];
        py = off[1];
        pz = g.staging[2] + off[2];

        if (t >= T.impact) {
          // Brief recoil, then glide onto the square the engine says it owns —
          // but only once the ghost has mostly crumbled, otherwise the attacker
          // walks straight through its dissolving victim.
          const recoil = -0.16 * Math.exp(-(t - T.impact) * 6.5);
          const settle = smoothstep(T.dissolve + 0.4, 2.4, t);
          const bx = g.strike[0] + g.dir[0] * recoil;
          const bz = g.strike[2] + g.dir[2] * recoil;
          px = lerp(bx, g.to[0], settle);
          pz = lerp(bz, g.to[2], settle);
          py = lerp(py, 0, settle);
        }
      }
      stage.attackerPos[0] = px;
      stage.attackerPos[1] = py;
      stage.attackerPos[2] = pz;

      /* ── 각인 발광 (0.3s 상승 → 타격 스파이크 → 2.3s 감쇠) ───────── */
      let awaken = smoothstep(T.sigil, T.attack, t) * 0.6;
      if (t >= T.attack) {
        const k = clamp01((t - T.attack) / (T.impact - T.attack));
        awaken = Math.max(
          awaken,
          variant.awaken?.({ k, t, dir: g.dir, reach: g.reach }) ?? k,
        );
      }
      if (t >= T.impact) {
        awaken = Math.max(awaken, 1.7 * Math.exp(-(t - T.impact) * 3.4) + 0.55);
      }
      stage.awaken = awaken * (1 - smoothstep(T.restore, T.end - 0.1, t));

      /* ── 피격 기물 넉백 ────────────────────────────────────────── */
      const knock =
        t < T.impact ? 0 : 0.19 * Math.exp(-(t - T.impact) * 5.2);
      stage.victimPos[0] = g.to[0] + g.dir[0] * knock;
      stage.victimPos[1] = 0;
      stage.victimPos[2] = g.to[2] + g.dir[2] * knock;

      /* ── 암전 / 플래시 / 트라우마 ──────────────────────────────── */
      stage.dim =
        smoothstep(0, 0.42, t) * (1 - smoothstep(T.restore, T.end - 0.15, t));
      stage.flash =
        t < T.impact ? 0 : Math.min(1, Math.exp(-(t - T.impact) * 10));
      stage.trauma =
        (t < T.attack ? 0 : 0.22 * Math.exp(-(t - T.attack) * 5)) +
        (t < T.impact ? 0 : 1.0 * Math.exp(-(t - T.impact) * 3.1));

      /* ── 혈흔 데칼은 연출이 끝나도 남는다 ──────────────────────── */
      if (!decalFired.current && t >= T.dissolve) {
        decalFired.current = true;
        onDecal();
      }

      /* ── 카메라 ───────────────────────────────────────────────── */
      const intro = smoothstep(0, 0.52, t);
      const outro = smoothstep(T.restore, T.end - 0.06, t);
      const push = 1 - 0.11 * smoothstep(0.5, T.impact, t);

      tmpA
        .copy(g.camPos)
        .sub(g.camTarget)
        .multiplyScalar(push)
        .add(g.camTarget);
      tmpA.lerpVectors(homePos.current, tmpA, intro);
      tmpA.lerp(homePos.current, outro);

      const shake = stage.trauma * stage.trauma * 0.24;
      if (shake > 0.0004) {
        tmpA.x += Math.sin(t * 71.3) * shake;
        tmpA.y += Math.sin(t * 53.7 + 1.7) * shake * 0.8;
        tmpA.z += Math.sin(t * 63.1 + 3.1) * shake;
      }
      camera.position.copy(tmpA);

      tmpB.lerpVectors(homeTgt.current, g.camTarget, intro);
      tmpB.lerp(homeTgt.current, outro);
      camera.lookAt(tmpB);

      if (stage.raw >= DURATION) {
        running.current = false;
        camera.position.copy(homePos.current);
        camera.lookAt(homeTgt.current);
        resetStage();
        if (controls) controls.enabled = true;
        onEnd();
      }
      return;
    }

    if (restoreLeft.current > 0) {
      restoreLeft.current = Math.max(0, restoreLeft.current - dt);
      const k = easeOutCubic(1 - restoreLeft.current / SKIP_RESTORE);
      camera.position.lerpVectors(restoreFrom.current, homePos.current, k);
      camera.lookAt(homeTgt.current);
      if (restoreLeft.current === 0 && controls) controls.enabled = true;
    }
  }, -2);

  return null;
}

export default CinematicDirector;
