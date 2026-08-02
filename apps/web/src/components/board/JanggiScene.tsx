"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import {
  ACESFilmicToneMapping,
  type DirectionalLight,
  HalfFloatType,
  type HemisphereLight,
  type AmbientLight,
  type PerspectiveCamera,
  type PointLight,
  type SpotLight,
} from "three";
import { BoardMesh } from "./BoardMesh";
import { BOARD_D, BOARD_W, squareKey } from "./layout";
import { DestinationMarkers, LastMoveTrail } from "./Markers";
import { BOARD_COLORS } from "./palette";
import { PieceMesh } from "./PieceMesh";
import type { PieceView, Side, SquareRef } from "./types";
import { type BloodDecal, BloodDecals } from "./vfx/BloodDecals";
import { CaptureFX } from "./vfx/CaptureFX";
import { CinematicDirector } from "./vfx/CinematicDirector";
import { type CinematicPlan, stage } from "./vfx/stage";
import { VictoryDirector } from "./vfx/VictoryDirector";
import type { VictoryPlan } from "./vfx/victory";
// side effect: registers the seven Tier 2 attacks into the P3 variant slot
import "./vfx/variants";

/**
 * Dev/E2E only: lets Playwright read the framebuffer back (`sampleFrame`) to
 * prove the cinematic frame is not a blank screen. Off in production builds.
 */
const ALLOW_FRAME_READBACK =
  process.env.NEXT_PUBLIC_E2E === "1" || process.env.NODE_ENV !== "production";

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

  /* ── P3 포획 연출 ─────────────────────────────────────────────── */
  /** non-null while the capture cinematic plays */
  cinematic?: CinematicPlan | null;
  /** 혈흔 표현 ON/OFF (PRD 2절) */
  gore?: boolean;
  /** 바닥에 남은 혈흔 자국 */
  decals?: BloodDecal[];
  /** the timeline ran to its end (2.8s) */
  onCinematicEnd?: () => void;
  /** 1.5s — commit the 혈흔 데칼 so it survives the cinematic */
  onDecalCommit?: () => void;
  /** 외통 승리 연출 (P4) — non-null while it plays */
  victory?: VictoryPlan | null;
  /** the victory timeline ran to its end (3.2s) */
  onVictoryEnd?: () => void;
  /**
   * 카메라가 서는 진영 (P5 온라인: 내 진영 시점 고정). 기본 "cho" —
   * 로컬 대국은 초 뒤에서 내려다보는 기존 시점을 그대로 쓴다.
   */
  viewSide?: Side;
}

const CAMERA_FOV = 38;
/** Fixed viewing direction: 부감 from behind the viewer's own side. */
const CAM_ELEVATION = Math.PI * 0.3; // ~54° above the horizon

/**
 * Orbit pivot, pushed toward the viewer's side so the board reads slightly
 * above centre and the bottom of the frame stays free for the match UI.
 */
export const SCENE_TARGET: [number, number, number] = [0, 0, 0.9];

/** +1 = 초 뒤편(+Z), −1 = 한 뒤편(−Z). */
function viewSign(side: Side): number {
  return side === "han" ? -1 : 1;
}

function sceneTarget(side: Side): [number, number, number] {
  return [SCENE_TARGET[0], SCENE_TARGET[1], SCENE_TARGET[2] * viewSign(side)];
}

function cameraPosition(
  distance: number,
  side: Side = "cho",
): [number, number, number] {
  const target = sceneTarget(side);
  return [
    target[0],
    target[1] + Math.sin(CAM_ELEVATION) * distance,
    target[2] + Math.cos(CAM_ELEVATION) * distance * viewSign(side),
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
function AutoFrame({
  userMoved,
  viewSide,
}: {
  userMoved: React.RefObject<boolean>;
  viewSide: Side;
}) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);

  useEffect(() => {
    if (userMoved.current) return;
    const aspect = Math.max(0.35, size.width / Math.max(1, size.height));
    const vFov = (CAMERA_FOV * Math.PI) / 180;
    const tanV = Math.tan(vFov / 2);
    const tanH = tanV * aspect;

    const sign = viewSign(viewSide);
    const target = sceneTarget(viewSide);
    const sinE = Math.sin(CAM_ELEVATION);
    const cosE = Math.cos(CAM_ELEVATION);
    // camera basis for lookAt(pivot) with world-up +Y
    const d: [number, number, number] = [0, sinE, cosE * sign];
    const right: [number, number, number] = [1, 0, 0];
    const up: [number, number, number] = [0, cosE, -sinE * sign];

    let distance = 0;
    for (const raw of FRAME_POINTS) {
      // solve relative to the orbit pivot
      const p = [raw[0] - target[0], raw[1] - target[1], raw[2] - target[2]];
      const along = p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
      const dr = Math.abs(p[0] * right[0] + p[1] * right[1] + p[2] * right[2]);
      const du = Math.abs(p[0] * up[0] + p[1] * up[1] + p[2] * up[2]);
      distance = Math.max(distance, along + dr / tanH, along + du / tanV);
    }
    distance = Math.min(26, Math.max(9, distance * 1.08));

    const [x, y, z] = cameraPosition(distance, viewSide);
    camera.position.set(x, y, z);
    camera.lookAt(...target);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, userMoved, viewSide]);

  return null;
}

/**
 * 배경 암전 (SCENES.md 2절 0.0s) — the cinematic pulls the room lights down so
 * only the two duelling pieces and their effects carry the frame.
 */
function SceneLights({ lowSpec }: { lowSpec: boolean }) {
  const shadowSize = lowSpec ? 1024 : 2048;
  const ambient = useRef<AmbientLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const key = useRef<SpotLight>(null);
  const fill = useRef<DirectionalLight>(null);
  const rimA = useRef<PointLight>(null);
  const rimB = useRef<PointLight>(null);

  useFrame(() => {
    const dim = stage.dim;
    if (dim <= 0 && !stage.active) {
      if (ambient.current) ambient.current.intensity = 0.34;
      if (hemi.current) hemi.current.intensity = 0.36;
      if (key.current) key.current.intensity = 520;
      if (fill.current) fill.current.intensity = 0.42;
      if (rimA.current) rimA.current.intensity = 38;
      if (rimB.current) rimB.current.intensity = 38;
      return;
    }
    const flash = 1 + stage.flash * 1.4;
    if (ambient.current) ambient.current.intensity = 0.34 * (1 - 0.8 * dim);
    if (hemi.current) hemi.current.intensity = 0.36 * (1 - 0.8 * dim);
    if (key.current) key.current.intensity = 520 * (1 - 0.62 * dim) * flash;
    if (fill.current) fill.current.intensity = 0.42 * (1 - 0.85 * dim);
    if (rimA.current) rimA.current.intensity = 38 * (1 - 0.5 * dim);
    if (rimB.current) rimB.current.intensity = 38 * (1 - 0.5 * dim);
  }, -1);

  return (
    <>
      <ambientLight ref={ambient} intensity={0.34} color="#59688f" />
      <hemisphereLight ref={hemi} args={["#6d7ea9", "#14100c", 0.36]} />

      {/* key light — a broad warm pool centred on the board */}
      <spotLight
        ref={key}
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
        ref={fill}
        position={[6.5, 8.5, -4]}
        intensity={0.42}
        color="#ffcf9c"
      />

      {/* faction rim lights — the 판타지 half of the tone */}
      <pointLight
        ref={rimA}
        position={[-8, 2.2, 7.5]}
        intensity={38}
        distance={24}
        decay={2}
        color="#19c4a6"
      />
      <pointLight
        ref={rimB}
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
  lowSpec = false,
  cinematic = null,
  gore = true,
  decals = [],
  onCinematicEnd,
  onDecalCommit,
  victory = null,
  onVictoryEnd,
  viewSide = "cho",
}: JanggiSceneProps) {
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

      <BloodDecals decals={decals} />

      <CinematicDirector
        plan={cinematic}
        gore={gore}
        homeTarget={sceneTarget(viewSide)}
        onEnd={onCinematicEnd ?? noop}
        onDecal={onDecalCommit ?? noop}
      />

      <VictoryDirector
        plan={victory}
        homeTarget={sceneTarget(viewSide)}
        onEnd={onVictoryEnd ?? noop}
      />

      {cinematic && (
        <CaptureFX
          key={cinematic.seq}
          plan={cinematic}
          gore={gore}
          lowSpec={lowSpec}
        />
      )}

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
          glyphSpin={viewSide === "han"}
        />
      ))}
    </>
  );
}

/**
 * 3D 장기판 + 기물 프레젠테이션 레이어.
 * Renders its own <Canvas> and fills the parent element.
 */
function noop() {}

export function JanggiScene({
  lowSpec = false,
  viewSide = "cho",
  ...rest
}: JanggiSceneProps) {
  const userMoved = useRef(false);
  // 한 시점은 방위각 π 기준으로 같은 폭만큼 좌우 회전을 허용한다
  // (three의 OrbitControls가 ±π 경계를 감아서 처리한다)
  const azimuth = viewSide === "han" ? Math.PI : 0;

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
        preserveDrawingBuffer: ALLOW_FRAME_READBACK,
      }}
      camera={{
        fov: CAMERA_FOV,
        near: 0.1,
        far: 160,
        position: cameraPosition(14, viewSide),
      }}
      data-testid="janggi-canvas"
    >
      <color attach="background" args={[BOARD_COLORS.background]} />
      <fog attach="fog" args={[BOARD_COLORS.background, 20, 52]} />

      <AutoFrame userMoved={userMoved} viewSide={viewSide} />
      <SceneLights lowSpec={lowSpec} />
      <BoardContents lowSpec={lowSpec} viewSide={viewSide} {...rest} />

      <OrbitControls
        makeDefault
        key={viewSide}
        target={sceneTarget(viewSide)}
        enablePan={false}
        enableDamping
        dampingFactor={0.09}
        rotateSpeed={0.5}
        zoomSpeed={0.6}
        minDistance={8}
        maxDistance={22}
        minPolarAngle={0.1}
        maxPolarAngle={1.17}
        minAzimuthAngle={azimuth - 0.8}
        maxAzimuthAngle={azimuth + 0.8}
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
