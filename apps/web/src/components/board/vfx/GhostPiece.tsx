"use client";

/**
 * 피격 기물 고스트.
 *
 * The engine deleted the captured piece the instant the move was applied, so
 * the cinematic re-renders it here for its final 2.8 seconds: it takes the
 * hit, gets knocked back, then dissolves through the custom shader
 * (SCENES.md 2절 1.5s).
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { PIECE_METRICS } from "../layout";
import { SIDE_THEME } from "../palette";
import { getGlyphTexture } from "../textures";
import type { PieceView } from "../types";
import { createDissolveMaterial } from "./DissolveMaterial";
import { clamp01, smoothstep, stage, T } from "./stage";

/** 소멸 색: 주홍 → 재 (SCENES.md 1절). */
const EMBER = "#ff7a2e";

const DISSOLVE_SPAN = 0.72;

export function GhostPiece({ piece }: { piece: PieceView }) {
  const { radius, height } = PIECE_METRICS[piece.type];
  const theme = SIDE_THEME[piece.side];
  const rootRef = useRef<Group>(null);

  const rTop = radius * 0.88;
  const faceSize = (radius * 2) / 0.944;
  const glyph = useMemo(
    () => getGlyphTexture(piece.type, piece.side),
    [piece.type, piece.side],
  );

  const bodyMat = useMemo(
    () =>
      createDissolveMaterial({
        color: theme.body,
        edgeColor: EMBER,
        emissive: theme.bodyEmissive,
        emissiveGain: 0.55,
        noiseScale: 8.5,
        edge: 0.1,
        yBase: 0,
        ySpan: height + 0.06,
      }),
    [theme.body, theme.bodyEmissive, height],
  );

  const plinthMat = useMemo(
    () =>
      createDissolveMaterial({
        color: "#1a120c",
        edgeColor: EMBER,
        emissive: "#3a1c08",
        emissiveGain: 0.2,
        noiseScale: 11,
        edge: 0.12,
        yBase: -0.4,
        ySpan: 1.2,
      }),
    [],
  );

  const faceMat = useMemo(
    () =>
      createDissolveMaterial({
        color: "#ffffff",
        edgeColor: "#ffb066",
        emissive: theme.accent,
        emissiveGain: 0.55,
        map: glyph,
        noiseScale: 9,
        edge: 0.11,
        yBase: -0.5,
        ySpan: 1.4,
      }),
    [glyph, theme.accent],
  );

  useEffect(
    () => () => {
      bodyMat.dispose();
      plinthMat.dispose();
      faceMat.dispose();
    },
    [bodyMat, plinthMat, faceMat],
  );

  useFrame(() => {
    const t = stage.t;
    const root = rootRef.current;
    if (root) {
      root.position.set(
        stage.victimPos[0],
        stage.victimPos[1],
        stage.victimPos[2],
      );
      // struck: tips away from the blow, then keeps toppling as it dissolves
      const tilt =
        t < T.impact
          ? 0
          : 0.24 * Math.exp(-(t - T.impact) * 3.6) +
            0.16 * smoothstep(T.dissolve, T.dissolve + DISSOLVE_SPAN, t);
      root.rotation.z = tilt * 0.7;
      root.rotation.x = -tilt * 0.35;
    }

    // charge-up glow, then a white-hot spike at the moment of impact
    const charge = smoothstep(T.sigil, T.impact, t) * 0.5;
    const hit = t < T.impact ? 0 : 2.2 * Math.exp(-(t - T.impact) * 4.5);
    const gain = 0.55 + charge + hit;
    bodyMat.uniforms.uEmissiveGain.value = gain;
    faceMat.uniforms.uEmissiveGain.value = 0.55 + charge * 1.6 + hit * 1.4;
    plinthMat.uniforms.uEmissiveGain.value = 0.2 + charge * 0.6;

    const p = clamp01((t - T.dissolve) / DISSOLVE_SPAN);
    bodyMat.setProgress(p);
    plinthMat.setProgress(clamp01((t - T.dissolve + 0.08) / DISSOLVE_SPAN));
    faceMat.setProgress(clamp01((t - T.dissolve - 0.06) / DISSOLVE_SPAN));
  });

  return (
    <group ref={rootRef} renderOrder={4}>
      <mesh position={[0, 0.018, 0]} material={plinthMat}>
        <cylinderGeometry args={[radius * 1.04, radius * 1.09, 0.036, 8]} />
      </mesh>

      <mesh position={[0, height / 2 + 0.03, 0]} material={bodyMat}>
        <cylinderGeometry args={[rTop, radius, height, 8]} />
      </mesh>

      <mesh
        position={[0, height + 0.035, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={faceMat}
        renderOrder={5}
      >
        <planeGeometry args={[faceSize, faceSize]} />
      </mesh>
    </group>
  );
}

export default GhostPiece;
