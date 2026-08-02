"use client";

import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  DoubleSide,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  RepeatWrapping,
} from "three";
import { PIECE_METRICS, squareToWorld } from "./layout";
import { MARKER_COLORS, SIDE_THEME } from "./palette";
import { getGlowTexture, getGlyphTexture, getGrainTexture } from "./textures";
import type { PieceView } from "./types";
import { stage } from "./vfx/stage";

export interface PieceMeshProps {
  piece: PieceView;
  selected: boolean;
  /** true for the 궁 of the side currently in 장군 */
  alerted: boolean;
  onPieceClick: (id: string) => void;
  /**
   * 한 진영 시점(온라인, P5)에서는 카메라가 판 반대편에 선다. 각인이 거꾸로
   * 읽히지 않도록 면판을 180° 돌린다 — 실제 장기판에서 각자의 말이 자기
   * 쪽을 향하는 것과 같다.
   */
  glyphSpin?: boolean;
}

const RIM_BAND = 0.05;

/**
 * A single 팔각기둥 piece: procedural wood body, glowing rim band and an
 * engraved hanja face plate. Selection lifts + brightens it; 장군 makes the
 * threatened 궁 pulse red.
 */
export function PieceMesh({
  piece,
  selected,
  alerted,
  onPieceClick,
  glyphSpin = false,
}: PieceMeshProps) {
  const { radius, height } = PIECE_METRICS[piece.type];
  const theme = SIDE_THEME[piece.side];

  const rootRef = useRef<Group>(null);
  const liftRef = useRef<Group>(null);
  const bodyMatRef = useRef<MeshStandardMaterial>(null);
  const faceMatRef = useRef<MeshStandardMaterial>(null);
  const rimMatRef = useRef<MeshBasicMaterial>(null);
  const glowMatRef = useRef<MeshBasicMaterial>(null);
  const alertRef = useRef<Mesh>(null);
  const alertMatRef = useRef<MeshBasicMaterial>(null);

  const grain = useMemo(() => {
    const t = getGrainTexture(piece.side === "cho" ? 41 : 97, 1.1, 0.9);
    if (t) {
      t.wrapS = RepeatWrapping;
      t.wrapT = RepeatWrapping;
      t.repeat.set(2, 1);
    }
    return t;
  }, [piece.side]);

  const glyph = useMemo(
    () => getGlyphTexture(piece.type, piece.side),
    [piece.type, piece.side],
  );
  const glow = useMemo(() => getGlowTexture(), []);

  const rTop = radius * 0.88;
  const rAtBand = radius + (rTop - radius) * ((height - RIM_BAND) / height);
  const faceSize = (radius * 2) / 0.944;

  const target = squareToWorld(piece.file, piece.rank);

  useLayoutEffect(() => {
    rootRef.current?.position.set(target[0], 0, target[2]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);

    // While a capture cinematic runs, the director owns the attacker's
    // transform (staging → lunge → settle); every other piece keeps gliding.
    const directed = stage.active && stage.attackerId === piece.id;

    const root = rootRef.current;
    if (root) {
      if (directed) {
        root.position.set(
          stage.attackerPos[0],
          stage.attackerPos[1],
          stage.attackerPos[2],
        );
      } else {
        const k = 1 - Math.pow(0.0006, dt);
        root.position.x += (target[0] - root.position.x) * k;
        root.position.y += (0 - root.position.y) * k;
        root.position.z += (target[2] - root.position.z) * k;
      }
    }

    // selection lift + gentle hover
    const lift = liftRef.current;
    if (lift) {
      const wanted = selected ? 0.17 + Math.sin(t * 2.6) * 0.022 : 0;
      lift.position.y += (wanted - lift.position.y) * (1 - Math.pow(0.002, dt));
    }

    const pulse = 0.5 + 0.5 * Math.sin(t * 3.4);
    // 각인 발광 상승 (SCENES.md 2절 0.3s) — the cinematic drives it far past
    // the selection level so the attacking piece reads as "각성"한 상태.
    const awake = Math.max(selected ? 1 : 0, directed ? stage.awaken : 0);
    // the engraving has to read as light, not as a blown-out hole — cap what
    // the emissive maps get even when the cinematic drives `awaken` past 1
    const glowAwake = Math.min(awake, 1);

    if (bodyMatRef.current) {
      bodyMatRef.current.emissiveIntensity =
        0.18 + glowAwake * (0.45 + pulse * 0.35);
    }
    if (faceMatRef.current) {
      faceMatRef.current.emissiveIntensity =
        0.6 + glowAwake * (0.3 + pulse * 0.22);
    }
    if (rimMatRef.current) {
      rimMatRef.current.opacity = Math.min(
        1,
        0.6 + glowAwake * (0.3 + pulse * 0.1),
      );
    }
    if (glowMatRef.current) {
      const wanted = directed
        ? Math.min(0.38, stage.awaken * 0.22)
        : selected
          ? 0.4 + pulse * 0.2
          : 0;
      // the cinematic snaps the glow on; normal play eases it
      glowMatRef.current.opacity += directed
        ? (wanted - glowMatRef.current.opacity) * (1 - Math.pow(1e-9, dt))
        : (wanted - glowMatRef.current.opacity) * (1 - Math.pow(0.004, dt));
    }
    if (alertRef.current && alertMatRef.current) {
      const wanted = alerted ? 0.42 + pulse * 0.45 : 0;
      alertMatRef.current.opacity +=
        (wanted - alertMatRef.current.opacity) * (1 - Math.pow(0.004, dt));
      const s = alerted ? 1 + pulse * 0.16 : 1;
      alertRef.current.scale.set(s, s, 1);
      alertRef.current.visible = alertMatRef.current.opacity > 0.01;
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onPieceClick(piece.id);
  };

  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (typeof document !== "undefined") document.body.style.cursor = "pointer";
  };
  const handleOut = () => {
    if (typeof document !== "undefined") document.body.style.cursor = "auto";
  };

  return (
    <group ref={rootRef}>
      {/* 장군 warning pulse (stays on the board surface) */}
      <mesh
        ref={alertRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.014, 0]}
        visible={false}
      >
        <ringGeometry args={[radius * 1.16, radius * 1.62, 40]} />
        <meshBasicMaterial
          ref={alertMatRef}
          color={MARKER_COLORS.check}
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/* selection ground glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[radius * 4.2, radius * 4.2]} />
        <meshBasicMaterial
          ref={glowMatRef}
          map={glow ?? undefined}
          color={theme.accent}
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <group
        ref={liftRef}
        onClick={handleClick}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
      >
        {/* footed plinth */}
        <mesh position={[0, 0.018, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[radius * 1.04, radius * 1.09, 0.036, 8]} />
          <meshStandardMaterial
            color="#1a120c"
            roughness={0.8}
            metalness={0.12}
          />
        </mesh>

        {/* octagonal body */}
        <mesh position={[0, height / 2 + 0.03, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[rTop, radius, height, 8]} />
          <meshStandardMaterial
            ref={bodyMatRef}
            color={theme.body}
            map={grain ?? undefined}
            emissive={theme.bodyEmissive}
            emissiveIntensity={0.18}
            roughness={0.52}
            metalness={0.16}
          />
        </mesh>

        {/* glowing rim band just under the face */}
        <mesh position={[0, height + 0.03 - RIM_BAND / 2, 0]}>
          <cylinderGeometry
            args={[rTop * 1.014, rAtBand * 1.014, RIM_BAND, 8, 1, true]}
          />
          <meshBasicMaterial
            ref={rimMatRef}
            color={theme.accent}
            transparent
            opacity={0.72}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>

        {/* engraved hanja face plate */}
        <mesh
          position={[0, height + 0.033, 0]}
          rotation={[-Math.PI / 2, 0, glyphSpin ? Math.PI : 0]}
          renderOrder={2}
        >
          <planeGeometry args={[faceSize, faceSize]} />
          <meshStandardMaterial
            ref={faceMatRef}
            map={glyph ?? undefined}
            emissiveMap={glyph ?? undefined}
            emissive="#ffffff"
            emissiveIntensity={0.6}
            transparent
            depthWrite={false}
            roughness={0.5}
            metalness={0}
          />
        </mesh>
      </group>
    </group>
  );
}

export default PieceMesh;
