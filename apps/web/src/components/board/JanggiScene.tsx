"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import { ACESFilmicToneMapping, HalfFloatType, type PerspectiveCamera } from "three";
import { BoardMesh } from "./BoardMesh";
import { BOARD_D, BOARD_W, squareKey } from "./layout";
import { DestinationMarkers, LastMoveTrail } from "./Markers";
import { BOARD_COLORS } from "./palette";
import { PieceMesh } from "./PieceMesh";
import type { PieceView, Side, SquareRef } from "./types";

/**
 * Pure presentation contract. Every piece of game state arrives as a prop —
 * this component never imports the rules engine.
 */
export interface JanggiSceneProps {
  pieces: PieceView[];
  selectedPieceId: string | null;
  /** legal destinations for the selected piece */
  highlights: SquareRef[];
  lastMove: { from: SquareRef; to: SquareRef } | null;
  /** side currently in 장군 — its 궁 pulses red */
  checkSide: Side | null;
  onSquareClick: (sq: SquareRef) => void;
  onPieceClick: (id: string) => void;
  /** low-spec mode: skips post-processing and heavy shadow maps */
  lowSpec?: boolean;
}

const CAMERA_FOV = 38;
/** Fixed viewing direction: 부감 from behind 초 (bottom of the screen). */
const CAM_ELEVATION = Math.PI * 0.3; // ~54° above the horizon

/**
 * Orbit pivot, pushed toward 초 so the board reads slightly above centre and
 * the bottom of the frame stays free for the match UI.
 */
export const SCENE_TARGET: [number, number, number] = [0, 0, 0.9];

function cameraPosition(distance: number): [number, number, number] {
  return [
    SCENE_TARGET[0],
    SCENE_TARGET[1] + Math.sin(CAM_ELEVATION) * distance,
    SCENE_TARGET[2] + Math.cos(CAM_ELEVATION) * distance,
  ];
}

/** Corners of the slab (plus headroom for the tallest piece). */
const FRAME_POINTS: [number, number, number][] = [];
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    for (const y of [0.5, -0.7]) {
      FRAME_POINTS.push([(sx * BOARD_W) / 2, y, (sz * BOARD_D) / 2]);
    }
  }
}

/**
 * Frames the whole board on load and on resize, but yields to the user as
 * soon as they touch the orbit controls. Solved in closed form: with the
 * camera at t·d looking at the origin, every corner must satisfy
 * t >= dot(p,d) + |dot(p,axis)| / tan(fov/2).
 */
function AutoFrame({ userMoved }: { userMoved: React.RefObject<boolean> }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);

  useEffect(() => {
    if (userMoved.current) return;
    const aspect = Math.max(0.35, size.width / Math.max(1, size.height));
    const vFov = (CAMERA_FOV * Math.PI) / 180;
    const tanV = Math.tan(vFov / 2);
    const tanH = tanV * aspect;

    const sinE = Math.sin(CAM_ELEVATION);
    const cosE = Math.cos(CAM_ELEVATION);
    // camera basis for lookAt(origin) with world-up +Y
    const d: [number, number, number] = [0, sinE, cosE];
    const right: [number, number, number] = [1, 0, 0];
    const up: [number, number, number] = [0, cosE, -sinE];

    let distance = 0;
    for (const raw of FRAME_POINTS) {
      // solve relative to the orbit pivot
      const p = [
        raw[0] - SCENE_TARGET[0],
        raw[1] - SCENE_TARGET[1],
        raw[2] - SCENE_TARGET[2],
      ];
      const along = p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
      const dr = Math.abs(p[0] * right[0] + p[1] * right[1] + p[2] * right[2]);
      const du = Math.abs(p[0] * up[0] + p[1] * up[1] + p[2] * up[2]);
      distance = Math.max(distance, along + dr / tanH, along + du / tanV);
    }
    distance = Math.min(26, Math.max(9, distance * 1.08));

    const [x, y, z] = cameraPosition(distance);
    camera.position.set(x, y, z);
    camera.lookAt(...SCENE_TARGET);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, userMoved]);

  return null;
}

function SceneLights({ lowSpec }: { lowSpec: boolean }) {
  const shadowSize = lowSpec ? 1024 : 2048;
  return (
    <>
      <ambientLight intensity={0.34} color="#59688f" />
      <hemisphereLight args={["#6d7ea9", "#14100c", 0.36]} />

      {/* key light — a broad warm pool centred on the board */}
      <spotLight
        position={[1.2, 16, 5.5]}
        angle={0.72}
        penumbra={0.85}
        intensity={520}
        distance={54}
        decay={2}
        color="#ffdcac"
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0009}
        shadow-normalBias={0.02}
      />

      {/* soft warm fill so the wood grain reads at the far edge */}
      <directionalLight
        position={[6.5, 8.5, -4]}
        intensity={0.42}
        color="#ffcf9c"
      />

      {/* faction rim lights — the 판타지 half of the tone */}
      <pointLight
        position={[-8, 2.2, 7.5]}
        intensity={38}
        distance={24}
        decay={2}
        color="#19c4a6"
      />
      <pointLight
        position={[8, 2.2, -7.5]}
        intensity={38}
        distance={24}
        decay={2}
        color="#e03a30"
      />
    </>
  );
}

function BoardContents({
  pieces,
  selectedPieceId,
  highlights,
  lastMove,
  checkSide,
  onSquareClick,
  onPieceClick,
}: Omit<JanggiSceneProps, "lowSpec">) {
  const occupied = useMemo(() => {
    const s = new Set<string>();
    for (const p of pieces) s.add(squareKey(p));
    return s;
  }, [pieces]);

  const alertedGeneralId = useMemo(() => {
    if (!checkSide) return null;
    return (
      pieces.find((p) => p.type === "general" && p.side === checkSide)?.id ??
      null
    );
  }, [pieces, checkSide]);

  const trailKey = lastMove
    ? `${squareKey(lastMove.from)}>${squareKey(lastMove.to)}`
    : "none";

  return (
    <>
      <BoardMesh onSquareClick={onSquareClick} />

      {lastMove && (
        <LastMoveTrail
          key={trailKey}
          from={lastMove.from}
          to={lastMove.to}
        />
      )}

      <DestinationMarkers highlights={highlights} occupied={occupied} />

      {pieces.map((p) => (
        <PieceMesh
          key={p.id}
          piece={p}
          selected={p.id === selectedPieceId}
          alerted={p.id === alertedGeneralId}
          onPieceClick={onPieceClick}
        />
      ))}
    </>
  );
}

/**
 * 3D 장기판 + 기물 프레젠테이션 레이어.
 * Renders its own <Canvas> and fills the parent element.
 */
export function JanggiScene({ lowSpec = false, ...rest }: JanggiSceneProps) {
  const userMoved = useRef(false);

  useEffect(() => {
    return () => {
      if (typeof document !== "undefined") document.body.style.cursor = "auto";
    };
  }, []);

  return (
    <Canvas
      shadows
      dpr={lowSpec ? 1 : [1, 2]}
      gl={{
        antialias: true,
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      camera={{
        fov: CAMERA_FOV,
        near: 0.1,
        far: 160,
        position: cameraPosition(14),
      }}
      data-testid="janggi-canvas"
    >
      <color attach="background" args={[BOARD_COLORS.background]} />
      <fog attach="fog" args={[BOARD_COLORS.background, 20, 52]} />

      <AutoFrame userMoved={userMoved} />
      <SceneLights lowSpec={lowSpec} />
      <BoardContents {...rest} />

      <OrbitControls
        makeDefault
        target={SCENE_TARGET}
        enablePan={false}
        enableDamping
        dampingFactor={0.09}
        rotateSpeed={0.5}
        zoomSpeed={0.6}
        minDistance={8}
        maxDistance={22}
        minPolarAngle={0.1}
        maxPolarAngle={1.17}
        minAzimuthAngle={-0.8}
        maxAzimuthAngle={0.8}
        onStart={() => {
          userMoved.current = true;
        }}
      />

      {!lowSpec && (
        <EffectComposer multisampling={4} frameBufferType={HalfFloatType}>
          <Bloom
            intensity={0.45}
            luminanceThreshold={0.42}
            luminanceSmoothing={0.45}
            radius={0.68}
            mipmapBlur
          />
          <Vignette offset={0.24} darkness={0.68} eskil={false} />
        </EffectComposer>
      )}
    </Canvas>
  );
}

export default JanggiScene;
