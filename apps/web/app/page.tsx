"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

/**
 * Placeholder "awakening" piece — a stand-in for the real 9x10 board + pieces
 * that land in P2. Confirms the R3F pipeline (renderer, lights, materials,
 * animation loop) is wired up end-to-end.
 */
function PlaceholderPiece() {
  const meshRef = useRef<Mesh>(null);

  useFrame((_state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.6;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <cylinderGeometry args={[1, 1, 0.35, 8]} />
      <meshStandardMaterial
        color="#1b6b63"
        emissive="#0d332f"
        emissiveIntensity={0.5}
        roughness={0.4}
        metalness={0.2}
      />
    </mesh>
  );
}

export default function Home() {
  return (
    <main className="h-screen w-screen bg-[#0a0a0f]">
      <Canvas
        camera={{ position: [0, 3, 5], fov: 50 }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      >
        <color attach="background" args={["#0a0a0f"]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 5, 2]} intensity={1.2} />
        <PlaceholderPiece />
      </Canvas>
    </main>
  );
}
