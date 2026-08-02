"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  CircleGeometry,
  DoubleSide,
  type Group,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
} from "three";
import { MARKER_Y, squareKey, squareToWorld, TRAIL_Y } from "./layout";
import { MARKER_COLORS } from "./palette";
import { getTrailTexture } from "./textures";
import type { SquareRef } from "./types";

export interface DestinationMarkersProps {
  highlights: SquareRef[];
  /** squareKey() of every occupied intersection — used to colour captures */
  occupied: Set<string>;
}

/**
 * Legal-destination markers. A destination that already holds a piece is a
 * capture and gets its own colour + a rotating bracket ring.
 */
export function DestinationMarkers({
  highlights,
  occupied,
}: DestinationMarkersProps) {
  const spinRef = useRef<Group>(null);

  const moveMat = useMemo(
    () =>
      new MeshBasicMaterial({
        color: MARKER_COLORS.move,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        toneMapped: false,
      }),
    [],
  );
  const captureMat = useMemo(
    () =>
      new MeshBasicMaterial({
        color: MARKER_COLORS.capture,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        toneMapped: false,
      }),
    [],
  );

  const dotGeo = useMemo(() => new CircleGeometry(0.082, 20), []);
  const ringGeo = useMemo(() => new RingGeometry(0.16, 0.215, 32), []);
  const capRingGeo = useMemo(() => new RingGeometry(0.46, 0.535, 44), []);
  const tickGeo = useMemo(() => new PlaneGeometry(0.19, 0.05), []);

  const split = useMemo(() => {
    const moves: SquareRef[] = [];
    const captures: SquareRef[] = [];
    for (const sq of highlights) {
      (occupied.has(squareKey(sq)) ? captures : moves).push(sq);
    }
    return { moves, captures };
  }, [highlights, occupied]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
    moveMat.opacity = 0.55 + pulse * 0.4;
    captureMat.opacity = 0.6 + pulse * 0.4;
    const spin = spinRef.current;
    if (spin) {
      for (const child of spin.children) child.rotation.z = t * 0.7;
    }
  });

  return (
    <group>
      {split.moves.map((sq) => {
        const [x, , z] = squareToWorld(sq.file, sq.rank);
        return (
          <group
            key={`m${squareKey(sq)}`}
            position={[x, MARKER_Y, z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <mesh geometry={dotGeo} material={moveMat} />
            <mesh geometry={ringGeo} material={moveMat} />
          </group>
        );
      })}

      <group ref={spinRef}>
        {split.captures.map((sq) => {
          const [x, , z] = squareToWorld(sq.file, sq.rank);
          return (
            <group
              key={`c${squareKey(sq)}`}
              position={[x, MARKER_Y, z]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <mesh geometry={capRingGeo} material={captureMat} />
              {[0, 1, 2, 3].map((i) => {
                const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
                return (
                  <mesh
                    key={i}
                    geometry={tickGeo}
                    material={captureMat}
                    position={[Math.cos(a) * 0.63, Math.sin(a) * 0.63, 0]}
                    rotation={[0, 0, a]}
                  />
                );
              })}
            </group>
          );
        })}
      </group>
    </group>
  );
}

export interface LastMoveTrailProps {
  from: SquareRef;
  to: SquareRef;
}

/** from→to afterglow streak plus end caps. */
export function LastMoveTrail({ from, to }: LastMoveTrailProps) {
  const life = useRef(0);
  const trailMat = useRef<MeshBasicMaterial>(null);
  const fromMat = useRef<MeshBasicMaterial>(null);
  const toMat = useRef<MeshBasicMaterial>(null);

  const map = useMemo(() => getTrailTexture(), []);

  const geom = useMemo(() => {
    const a = squareToWorld(from.file, from.rank);
    const b = squareToWorld(to.file, to.rank);
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const length = Math.hypot(dx, dz);
    return {
      a,
      b,
      length,
      mid: [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2] as [number, number],
      angle: Math.atan2(-dz, dx),
    };
  }, [from.file, from.rank, to.file, to.rank]);

  useFrame((_, delta) => {
    life.current += delta;
    const t = life.current;
    // quick flare, then settle into a steady afterglow
    const flare = Math.min(1, t / 0.18);
    const settle = 1 - 0.35 * Math.min(1, Math.max(0, (t - 0.18) / 1.1));
    const v = flare * settle;
    if (trailMat.current) trailMat.current.opacity = 0.8 * v;
    if (fromMat.current) fromMat.current.opacity = 0.55 * v;
    if (toMat.current) toMat.current.opacity = 0.95 * v;
  });

  if (geom.length < 1e-4) return null;

  return (
    <group>
      <mesh
        position={[geom.mid[0], TRAIL_Y, geom.mid[1]]}
        rotation={[-Math.PI / 2, 0, geom.angle]}
      >
        <planeGeometry args={[geom.length, 0.26]} />
        <meshBasicMaterial
          ref={trailMat}
          map={map ?? undefined}
          color={MARKER_COLORS.trail}
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>

      <mesh
        position={[geom.a[0], TRAIL_Y, geom.a[2]]}
        rotation={[-Math.PI / 2, 0, Math.PI / 4]}
      >
        <ringGeometry args={[0.34, 0.4, 4]} />
        <meshBasicMaterial
          ref={fromMat}
          color={MARKER_COLORS.trail}
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>

      <mesh
        position={[geom.b[0], TRAIL_Y, geom.b[2]]}
        rotation={[-Math.PI / 2, 0, Math.PI / 4]}
      >
        <ringGeometry args={[0.52, 0.62, 4]} />
        <meshBasicMaterial
          ref={toMat}
          color={MARKER_COLORS.trail}
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
