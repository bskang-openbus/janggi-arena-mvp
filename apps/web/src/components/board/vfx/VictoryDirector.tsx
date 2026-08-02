"use client";

/**
 * 외통 승리 연출의 카메라 리그 (P4).
 *
 * "슬로모션 최후 일격 리플레이 느낌의 카메라 회전" (docs/SCENES.md 3절):
 * the camera drifts around the mated 궁 and pushes in, slowly enough to read
 * as a replay rather than a cut. Same contract as `CinematicDirector` — frame
 * priority -2, no React state per frame, honours the deterministic test clock.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Vector3 } from "three";
import { squareToWorld } from "../layout";
import {
  cinematicClock,
  easeOutCubic,
  lerp,
  smoothstep,
  stageTime,
} from "./stage";
import { resetVictoryStage, victoryStage, type VictoryPlan, VT } from "./victory";

const RESTORE = 0.4;

export interface VictoryDirectorProps {
  plan: VictoryPlan | null;
  homeTarget: readonly [number, number, number];
  onEnd: () => void;
}

export function VictoryDirector({
  plan,
  homeTarget,
  onEnd,
}: VictoryDirectorProps) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as {
    enabled: boolean;
    target: Vector3;
  } | null;

  const running = useRef(false);
  const homePos = useRef(new Vector3());
  const homeTgt = useRef(new Vector3());
  const focus = useRef(new Vector3());
  const restoreFrom = useRef(new Vector3());
  const restoreLeft = useRef(0);
  const tmp = useMemo(() => new Vector3(), []);
  const look = useMemo(() => new Vector3(), []);

  useLayoutEffect(() => {
    if (!plan) {
      if (running.current) {
        running.current = false;
        restoreFrom.current.copy(camera.position);
        restoreLeft.current = RESTORE;
        resetVictoryStage();
      }
      return;
    }
    homePos.current.copy(camera.position);
    homeTgt.current.copy(controls?.target ?? new Vector3(...homeTarget));
    const [x, , z] = squareToWorld(plan.at.file, plan.at.rank);
    focus.current.set(x, 0.35, z);

    resetVictoryStage();
    victoryStage.active = true;
    victoryStage.winner = plan.winner;
    running.current = true;
    restoreLeft.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    if (running.current && plan) {
      if (controls) controls.enabled = false;

      if (cinematicClock.seek !== null) {
        victoryStage.raw = cinematicClock.seek;
        cinematicClock.seek = null;
      } else if (!cinematicClock.manual) {
        victoryStage.raw += dt;
      }
      const t = stageTime(victoryStage.raw);
      victoryStage.t = t;
      victoryStage.dim = smoothstep(0, 0.6, t);

      // Orbit the mated 궁: start from wherever the player was, swing a third
      // of a radian around it and close in — slow throughout.
      const k = easeOutCubic(Math.min(1, t / VT.end));
      const dx = homePos.current.x - focus.current.x;
      const dz = homePos.current.z - focus.current.z;
      const radius = Math.hypot(dx, dz) * lerp(1, 0.52, k);
      const angle = Math.atan2(dz, dx) + k * 0.62;
      tmp.set(
        focus.current.x + Math.cos(angle) * radius,
        lerp(homePos.current.y, homePos.current.y * 0.62 + 1.6, k),
        focus.current.z + Math.sin(angle) * radius,
      );
      camera.position.copy(tmp);
      look.lerpVectors(homeTgt.current, focus.current, smoothstep(0, 1.1, t));
      camera.lookAt(look);

      if (t >= VT.end) {
        running.current = false;
        resetVictoryStage();
        onEnd();
      }
      return;
    }

    if (restoreLeft.current > 0) {
      restoreLeft.current = Math.max(0, restoreLeft.current - dt);
      const k = easeOutCubic(1 - restoreLeft.current / RESTORE);
      camera.position.lerpVectors(restoreFrom.current, homePos.current, k);
      camera.lookAt(homeTgt.current);
      if (restoreLeft.current === 0 && controls) controls.enabled = true;
    }
  }, -2);

  return null;
}

export default VictoryDirector;
