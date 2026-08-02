"use client";

/**
 * Tiny imperative building block for the Tier 2 attacks (P4).
 *
 * Every Tier 2 effect is "one mesh whose transform and opacity are a function
 * of `stage.t`". Expressing that as props would mean a React render per frame,
 * so `Fx` instead hands the mesh and its material to a `drive` callback once
 * per frame. All of a variant's timing then reads top-to-bottom in one place
 * instead of being scattered across refs and effects.
 *
 * Keeping every effect a pure function of `stage.t` is also what lets the E2E
 * clock seek straight to a beat (docs/DECISIONS.md 2026-08-03 05:05) — do not
 * accumulate state across frames in a `drive`.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, useRef } from "react";
import {
  AdditiveBlending,
  type Camera,
  DoubleSide,
  type Mesh,
  type MeshBasicMaterial,
  NormalBlending,
  Quaternion,
  type Texture,
  Vector3,
} from "three";
import { stage } from "./stage";

export type FxDrive = (
  t: number,
  mesh: Mesh,
  material: MeshBasicMaterial,
  camera: Camera,
) => void;

export interface FxProps {
  /** the geometry element, e.g. `<planeGeometry args={[1, 1]} />` */
  children: ReactNode;
  color: string;
  map?: Texture | null;
  /** additive (light) by default; normal blending for smoke and shadows */
  additive?: boolean;
  renderOrder?: number;
  drive: FxDrive;
}

export function Fx({
  children,
  color,
  map,
  additive = true,
  renderOrder = 6,
  drive,
}: FxProps) {
  const meshRef = useRef<Mesh>(null);
  const matRef = useRef<MeshBasicMaterial>(null);
  const camera = useThree((s) => s.camera);

  useFrame(() => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;
    mat.opacity = 0;
    drive(stage.t, mesh, mat, camera);
    // an invisible mesh still costs a draw call — cull it outright
    mesh.visible = mat.opacity > 0.004;
  });

  return (
    <mesh ref={meshRef} renderOrder={renderOrder} visible={false}>
      {children}
      <meshBasicMaterial
        ref={matRef}
        map={map ?? undefined}
        color={color}
        transparent
        opacity={0}
        depthWrite={false}
        blending={additive ? AdditiveBlending : NormalBlending}
        side={DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Orientation helpers                                                 */
/* ------------------------------------------------------------------ */

const UP = new Vector3(0, 1, 0);
const scratch = new Vector3();
const scratchQ = new Quaternion();

/** Point the mesh's local +Y along `(x, y, z)` — cylinders, beams, spears. */
export function orientY(mesh: Mesh, x: number, y: number, z: number): void {
  scratch.set(x, y, z);
  if (scratch.lengthSq() < 1e-8) return;
  scratch.normalize();
  mesh.quaternion.setFromUnitVectors(UP, scratch);
}

/** Face the camera flat-on. */
export function billboard(mesh: Mesh, camera: Camera): void {
  mesh.quaternion.copy(camera.quaternion);
}

/**
 * Billboard, then spin in screen space by `roll` — used for slash arcs, which
 * must always read as a crescent no matter where the cinematic camera sits.
 */
export function billboardRoll(mesh: Mesh, camera: Camera, roll: number): void {
  mesh.quaternion.copy(camera.quaternion);
  scratchQ.setFromAxisAngle(new Vector3(0, 0, 1), roll);
  mesh.quaternion.multiply(scratchQ);
}

/** Lay the mesh flat on the board (plane/ring geometries are XY by default). */
export function layFlat(mesh: Mesh, spin = 0): void {
  mesh.rotation.set(-Math.PI / 2, 0, spin);
}

/** Live world position of the attacking piece (the director owns it). */
export function attackerPos(): readonly [number, number, number] {
  return stage.attackerPos;
}
