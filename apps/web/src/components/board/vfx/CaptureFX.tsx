"use client";

/**
 * 포획 연출의 3D 이펙트 묶음 (SCENES.md 2절).
 *
 * Mounted only while a cinematic is running, so unmounting it — which is what
 * "연출 스킵" does — is a complete teardown of every effect in one step.
 * Read the timeline top-to-bottom: 소환진(0.3s) → 공격(0.8s) →
 * 타격(1.2s: 충격파·스파크·혈흔·균열) → 디졸브(1.5s: 재 파티클).
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  DoubleSide,
  type Mesh,
  type MeshBasicMaterial,
  type PointLight,
} from "three";
import { MARKER_Y } from "../layout";
import { SIDE_THEME } from "../palette";
import { getGlowTexture } from "../textures";
import { getAttackVariant } from "./attackVariants";
import { GhostPiece } from "./GhostPiece";
import { type BurstSpec, ParticleBurst } from "./Particles";
import {
  type CinematicPlan,
  clamp01,
  duelGeometry,
  easeOutBack,
  easeOutCubic,
  smoothstep,
  stage,
  T,
} from "./stage";
import { getCrackTexture, getSigilTexture } from "./vfxTextures";

/* ------------------------------------------------------------------ */
/* 소환진 — 공격 기물 발밑 (0.3s)                                       */
/* ------------------------------------------------------------------ */

function SummonSigil({
  position,
  color,
}: {
  position: readonly [number, number, number];
  color: string;
}) {
  const outer = useRef<Mesh>(null);
  const inner = useRef<Mesh>(null);
  const outerMat = useRef<MeshBasicMaterial>(null);
  const innerMat = useRef<MeshBasicMaterial>(null);
  const map = useMemo(() => getSigilTexture(), []);

  useFrame(() => {
    const t = stage.t;
    const open = easeOutBack(clamp01((t - T.sigil) / 0.42));
    const fade =
      smoothstep(T.sigil, T.sigil + 0.2, t) *
      (1 - smoothstep(T.impact + 0.15, T.restore, t));
    const flare = t < T.impact ? 0 : 0.9 * Math.exp(-(t - T.impact) * 5);

    if (outer.current && outerMat.current) {
      const s = 1.55 * open;
      outer.current.scale.set(s, s, s);
      outer.current.rotation.z = -t * 0.55;
      outerMat.current.opacity = fade * (0.62 + flare);
    }
    if (inner.current && innerMat.current) {
      const s = 0.86 * easeOutBack(clamp01((t - T.sigil - 0.08) / 0.4));
      inner.current.scale.set(s, s, s);
      inner.current.rotation.z = t * 0.95;
      innerMat.current.opacity = fade * (0.5 + flare * 1.4);
    }
  });

  return (
    <group position={[position[0], MARKER_Y + 0.004, position[2]]}>
      <mesh ref={outer} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial
          ref={outerMat}
          map={map ?? undefined}
          color={color}
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh
        ref={inner}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.003, 0]}
        renderOrder={3}
      >
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial
          ref={innerMat}
          map={map ?? undefined}
          color="#ffffff"
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* 타격 — 충격파 링 + 균열 + 섬광 (1.2s)                                */
/* ------------------------------------------------------------------ */

function ImpactBurst({
  position,
  goreColor,
}: {
  position: readonly [number, number, number];
  goreColor: string;
}) {
  const ring1 = useRef<Mesh>(null);
  const ring2 = useRef<Mesh>(null);
  const mat1 = useRef<MeshBasicMaterial>(null);
  const mat2 = useRef<MeshBasicMaterial>(null);
  const crack = useRef<Mesh>(null);
  const crackMat = useRef<MeshBasicMaterial>(null);
  const core = useRef<Mesh>(null);
  const coreMat = useRef<MeshBasicMaterial>(null);
  const light = useRef<PointLight>(null);

  const crackMap = useMemo(() => getCrackTexture(), []);
  const glow = useMemo(() => getGlowTexture(), []);
  const camera = useThree((s) => s.camera);

  useFrame(() => {
    const a = stage.t - T.impact;

    if (ring1.current && mat1.current) {
      const k = clamp01(a / 0.62);
      const s = 0.18 + easeOutCubic(k) * 3.5;
      ring1.current.scale.set(s, s, s);
      mat1.current.opacity = a < 0 ? 0 : (1 - k) * 0.95;
      ring1.current.visible = a >= 0 && k < 1;
    }
    if (ring2.current && mat2.current) {
      const k = clamp01((a - 0.07) / 0.4);
      const s = 0.12 + easeOutCubic(k) * 2.1;
      ring2.current.scale.set(s, s, s);
      mat2.current.opacity = a < 0.07 ? 0 : (1 - k) * 0.85;
      ring2.current.visible = a >= 0.07 && k < 1;
    }
    if (crack.current && crackMat.current) {
      const k = clamp01(a / 0.16);
      const s = 0.5 + easeOutCubic(k) * 0.62;
      crack.current.scale.set(s, s, s);
      crackMat.current.opacity =
        a < 0 ? 0 : k * (1 - smoothstep(0.45, 1.4, a)) * 0.55;
      crack.current.visible = a >= 0;
    }
    if (core.current && coreMat.current) {
      // billboarded so the flash never reads as a flat card on the floor
      core.current.quaternion.copy(camera.quaternion);
      const s = 0.32 + easeOutCubic(clamp01(a / 0.2)) * 0.62;
      core.current.scale.set(s, s, s);
      coreMat.current.opacity =
        a < 0 ? 0 : Math.max(0, Math.exp(-a * 11)) * 0.85;
      core.current.visible = a >= 0;
    }
    if (light.current) {
      light.current.intensity =
        a < 0 ? 0 : 34 * Math.exp(-a * 6.5) + 5 * Math.exp(-a * 1.6);
    }
  });

  return (
    <group position={[position[0], 0, position[2]]}>
      {/* 지면 균열 */}
      <mesh
        ref={crack}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, MARKER_Y + 0.006, 0]}
        visible={false}
        renderOrder={3}
      >
        <planeGeometry args={[2.4, 2.4]} />
        <meshBasicMaterial
          ref={crackMat}
          map={crackMap ?? undefined}
          color="#ff8a3a"
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/* 충격파 링 ×2 */}
      <mesh
        ref={ring1}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, MARKER_Y + 0.012, 0]}
        visible={false}
        renderOrder={4}
      >
        <ringGeometry args={[0.38, 0.5, 64]} />
        <meshBasicMaterial
          ref={mat1}
          color={goreColor}
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh
        ref={ring2}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, MARKER_Y + 0.016, 0]}
        visible={false}
        renderOrder={4}
      >
        <ringGeometry args={[0.34, 0.47, 48]} />
        <meshBasicMaterial
          ref={mat2}
          color="#fff0cf"
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/* 타격 코어 섬광 */}
      <mesh
        ref={core}
        position={[0, 0.3, 0]}
        visible={false}
        renderOrder={5}
      >
        <planeGeometry args={[1.4, 1.4]} />
        <meshBasicMaterial
          ref={coreMat}
          map={glow ?? undefined}
          color="#ffffff"
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>

      <pointLight
        ref={light}
        position={[0, 0.5, 0]}
        color={goreColor}
        intensity={0}
        distance={9}
        decay={2}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* 공격 기물 각성 라이트 (0.3s~)                                        */
/* ------------------------------------------------------------------ */

function AwakenLight({ color }: { color: string }) {
  const light = useRef<PointLight>(null);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    l.position.set(
      stage.attackerPos[0],
      stage.attackerPos[1] + 0.26,
      stage.attackerPos[2],
    );
    l.intensity = stage.awaken * 6;
  });
  return (
    <pointLight
      ref={light}
      color={color}
      intensity={0}
      distance={6.5}
      decay={2}
    />
  );
}

/**
 * 연출 조명 — 무대 조명이 내려가는 만큼 두 기물 위로 올라온다. 암전 속에서도
 * 피격 기물의 실루엣과 한자 각인이 읽혀야 한다 (SCENES.md 2절).
 */
function DuelKeyLight({
  position,
  rimColor,
}: {
  position: readonly [number, number, number];
  rimColor: string;
}) {
  const key = useRef<PointLight>(null);
  const rim = useRef<PointLight>(null);
  useFrame(() => {
    if (key.current) key.current.intensity = 11 * stage.dim;
    if (rim.current) rim.current.intensity = 5.5 * stage.dim;
  });
  return (
    <group position={[position[0], 0, position[2]]}>
      <pointLight
        ref={key}
        position={[0, 1.45, 0]}
        color="#ffe9cd"
        intensity={0}
        distance={6.5}
        decay={2}
      />
      <pointLight
        ref={rim}
        position={[0, 0.55, 0]}
        color={rimColor}
        intensity={0}
        distance={4.2}
        decay={2}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* 조합                                                                 */
/* ------------------------------------------------------------------ */

export interface CaptureFXProps {
  plan: CinematicPlan;
  /** 혈흔 ON/OFF — OFF면 붉은 파티클이 백금색 스파크로 대체된다 */
  gore: boolean;
  /** 저사양 모드: 파티클 수를 절반으로 */
  lowSpec?: boolean;
}

export function CaptureFX({ plan, gore, lowSpec = false }: CaptureFXProps) {
  const geo = useMemo(() => duelGeometry(plan), [plan]);
  const attackerTheme = SIDE_THEME[plan.attacker.side];
  const variant = getAttackVariant(plan.variant);
  const Extras = variant.Extras;

  /** 혈흔 OFF → 붉은 계열을 전부 백금색으로 (SCENES.md 4절) */
  const goreColor = gore ? "#ff5a3c" : "#cfe0ff";
  const scale = lowSpec ? 0.5 : 1;

  const bursts = useMemo<BurstSpec[]>(() => {
    const hit: [number, number, number] = [
      geo.to[0],
      0.28,
      geo.to[2],
    ];
    const n = (v: number) => Math.max(8, Math.round(v * scale));

    const specs: BurstSpec[] = [
      // 스파크 — 가산혼합, 짧고 뜨겁게
      {
        count: n(150),
        origin: hit,
        t0: T.impact,
        life: 0.55,
        stagger: 0.05,
        speedMin: 2.1,
        speedMax: 6.4,
        upBias: 0.42,
        gravity: -7.4,
        drag: 2.6,
        size: 0.085,
        colorA: "#fff8dc",
        colorB: "#ffa32c",
        additive: true,
        radius: 0.12,
        seed: 101 + plan.seq,
      },
      // 혈흔(ON) / 백금 스파크(OFF)
      gore
        ? {
            count: n(120),
            origin: hit,
            t0: T.impact + 0.015,
            life: 0.95,
            stagger: 0.07,
            speedMin: 1.3,
            speedMax: 4.6,
            upBias: 0.36,
            gravity: -10.5,
            drag: 1.3,
            size: 0.075,
            colorA: "#e0241a",
            colorB: "#7d0705",
            radius: 0.14,
            seed: 202 + plan.seq,
          }
        : {
            count: n(120),
            origin: hit,
            t0: T.impact + 0.015,
            life: 0.8,
            stagger: 0.07,
            speedMin: 1.5,
            speedMax: 4.8,
            upBias: 0.4,
            gravity: -8.5,
            drag: 1.6,
            size: 0.07,
            colorA: "#ffffff",
            colorB: "#93b4e8",
            additive: true,
            radius: 0.14,
            seed: 202 + plan.seq,
          },
      // 재 — 중력 낙하 + 회전 사각
      {
        count: n(96),
        origin: [geo.to[0], 0.22, geo.to[2]],
        t0: T.dissolve,
        life: 1.15,
        stagger: 0.45,
        speedMin: 0.35,
        speedMax: 1.7,
        upBias: 0.5,
        gravity: -3.1,
        drag: 1.7,
        size: 0.072,
        sizeJitter: 0.6,
        colorA: "#453027",
        colorB: "#ff8a35",
        square: true,
        spin: 7,
        radius: 0.2,
        seed: 303 + plan.seq,
      },
    ];
    return specs;
  }, [geo, gore, plan.seq, scale]);

  return (
    <group>
      <DuelKeyLight
        position={[
          (geo.staging[0] + geo.to[0]) / 2,
          0,
          (geo.staging[2] + geo.to[2]) / 2,
        ]}
        rimColor={SIDE_THEME[plan.victim.side].accent}
      />
      <SummonSigil position={geo.staging} color={attackerTheme.accent} />
      <AwakenLight color={attackerTheme.accentHot} />
      <GhostPiece piece={plan.victim} />
      <ImpactBurst position={geo.to} goreColor={goreColor} />
      {bursts.map((spec) => (
        <ParticleBurst key={spec.seed} spec={spec} />
      ))}
      {Extras && (
        <Extras
          plan={plan}
          dir={geo.dir}
          origin={geo.staging}
          target={geo.to}
          lowSpec={lowSpec}
        />
      )}
    </group>
  );
}

export default CaptureFX;
