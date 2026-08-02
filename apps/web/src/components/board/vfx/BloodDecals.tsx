"use client";

/**
 * 바닥 혈흔 데칼 (SCENES.md 1절, 토글 대상).
 *
 * Unlike everything else in `vfx/`, decals outlive the cinematic — the board
 * keeps the marks of the battle. They are committed to the store at 1.5s so a
 * skipped cinematic leaves the same trace a watched one does. 혈흔 OFF면
 * 아예 생성되지 않는다 (SCENES.md 4절).
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { DoubleSide, type MeshBasicMaterial } from "three";
import { squareToWorld, TRAIL_Y } from "../layout";
import { getBloodDecalTexture } from "./vfxTextures";

export interface BloodDecal {
  id: string;
  file: number;
  rank: number;
  /**
   * World offset from the intersection, along the direction of the blow. The
   * capturing piece ends up standing exactly on the victim's square, so a
   * centred splatter would be permanently hidden underneath it.
   */
  dx: number;
  dz: number;
  /** picks one of the procedural splatter variants + its rotation */
  seed: number;
}

const FADE_IN = 0.45;
const MAX_OPACITY = 0.9;
/** How far the splatter is thrown past the piece that made it. */
const SPRAY = 0.42;

function Decal({ decal }: { decal: BloodDecal }) {
  const matRef = useRef<MeshBasicMaterial>(null);
  const age = useRef(0);
  const map = useMemo(
    () => getBloodDecalTexture(decal.seed % 6),
    [decal.seed],
  );
  const [sx, , sz] = squareToWorld(decal.file, decal.rank);
  const x = sx + decal.dx * SPRAY;
  const z = sz + decal.dz * SPRAY;
  const rotation = ((decal.seed % 360) / 360) * Math.PI * 2;
  const scale = 1.7 + ((decal.seed % 7) / 7) * 0.6;

  useFrame((_, delta) => {
    age.current += Math.min(delta, 0.05);
    if (matRef.current) {
      matRef.current.opacity =
        MAX_OPACITY * Math.min(1, age.current / FADE_IN);
    }
  });

  return (
    <mesh
      position={[x, TRAIL_Y - 0.002, z]}
      rotation={[-Math.PI / 2, 0, rotation]}
      scale={[scale, scale, 1]}
      renderOrder={1}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={matRef}
        map={map ?? undefined}
        color="#7d0d07"
        transparent
        opacity={0}
        depthWrite={false}
        side={DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

export function BloodDecals({ decals }: { decals: BloodDecal[] }) {
  return (
    <group>
      {decals.map((d) => (
        <Decal key={d.id} decal={d} />
      ))}
    </group>
  );
}

export default BloodDecals;
