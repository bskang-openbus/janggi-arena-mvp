"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import {
  DoubleSide,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
} from "three";
import {
  BASE_OVERHANG,
  BASE_THICKNESS,
  BOARD_D,
  BOARD_THICKNESS,
  BOARD_W,
  FILE_COUNT,
  GRID_D,
  GRID_W,
  LINE_Y,
  PALACE,
  RANK_COUNT,
  squareToWorld,
  worldToSquare,
} from "./layout";
import { BOARD_COLORS } from "./palette";
import { getBoardTopTexture, getGrainTexture } from "./textures";
import type { SquareRef } from "./types";

const OUTER_LINE_W = 0.062;
const INNER_LINE_W = 0.038;
const PALACE_LINE_W = 0.034;

interface LineSpec {
  key: string;
  x: number;
  z: number;
  length: number;
  width: number;
  angle: number;
}

function buildLines(): LineSpec[] {
  const lines: LineSpec[] = [];

  // 가로 10줄 (one per rank)
  for (let rank = 0; rank < RANK_COUNT; rank += 1) {
    const [, , z] = squareToWorld(0, rank);
    const edge = rank === 0 || rank === RANK_COUNT - 1;
    lines.push({
      key: `r${rank}`,
      x: 0,
      z,
      length: GRID_W + (edge ? OUTER_LINE_W : 0),
      width: edge ? OUTER_LINE_W : INNER_LINE_W,
      angle: 0,
    });
  }

  // 세로 9줄 (one per file)
  for (let file = 0; file < FILE_COUNT; file += 1) {
    const [x] = squareToWorld(file, 0);
    const edge = file === 0 || file === FILE_COUNT - 1;
    lines.push({
      key: `f${file}`,
      x,
      z: 0,
      length: GRID_D + (edge ? OUTER_LINE_W : 0),
      width: edge ? OUTER_LINE_W : INNER_LINE_W,
      angle: Math.PI / 2,
    });
  }

  // 궁성 X자 대각선 (d1-e2-f3 / f1-e2-d3, and the 한 mirror)
  const diagLength = Math.sqrt(8);
  for (const rankMin of [PALACE.cho.rankMin, PALACE.han.rankMin]) {
    const [cx, , cz] = squareToWorld(PALACE.fileMin + 1, rankMin + 1);
    lines.push({
      key: `pa${rankMin}`,
      x: cx,
      z: cz,
      length: diagLength,
      width: PALACE_LINE_W,
      angle: Math.PI / 4,
    });
    lines.push({
      key: `pb${rankMin}`,
      x: cx,
      z: cz,
      length: diagLength,
      width: PALACE_LINE_W,
      angle: -Math.PI / 4,
    });
  }

  return lines;
}

export interface BoardMeshProps {
  onSquareClick: (sq: SquareRef) => void;
}

/**
 * The wooden slab: procedural grain, the 9x10 printed grid and both palace
 * diagonals. Also owns the invisible pick plane that turns a click on the
 * surface into the nearest intersection.
 */
export function BoardMesh({ onSquareClick }: BoardMeshProps) {
  const topMap = useMemo(() => getBoardTopTexture(), []);
  const edgeMap = useMemo(() => {
    const t = getGrainTexture(303, 1.6, 1.25);
    if (t) {
      t.wrapS = RepeatWrapping;
      t.wrapT = RepeatWrapping;
      t.repeat.set(4, 1);
    }
    return t;
  }, []);

  const lines = useMemo(buildLines, []);
  const unitPlane = useMemo(() => new PlaneGeometry(1, 1), []);
  const lineMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: BOARD_COLORS.line,
        emissive: BOARD_COLORS.lineEmissive,
        emissiveIntensity: 0.22,
        roughness: 0.45,
        metalness: 0.15,
        side: DoubleSide,
      }),
    [],
  );

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSquareClick(worldToSquare(e.point.x, e.point.z));
  };

  return (
    <group>
      {/* light pool catcher far below the board */}
      <mesh
        position={[0, -BOARD_THICKNESS - BASE_THICKNESS - 0.35, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <circleGeometry args={[26, 48]} />
        <meshStandardMaterial color="#0a0b13" roughness={1} metalness={0} />
      </mesh>

      {/* base step */}
      <mesh
        position={[0, -BOARD_THICKNESS - BASE_THICKNESS / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[
            BOARD_W + BASE_OVERHANG * 2,
            BASE_THICKNESS,
            BOARD_D + BASE_OVERHANG * 2,
          ]}
        />
        <meshStandardMaterial
          color={BOARD_COLORS.baseWood}
          roughness={0.85}
          metalness={0.04}
        />
      </mesh>

      {/* main slab — top face carries the procedural wood */}
      <mesh position={[0, -BOARD_THICKNESS / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[BOARD_W, BOARD_THICKNESS, BOARD_D]} />
        <meshStandardMaterial
          attach="material-0"
          color={BOARD_COLORS.edgeWood}
          map={edgeMap}
          roughness={0.72}
          metalness={0.05}
        />
        <meshStandardMaterial
          attach="material-1"
          color={BOARD_COLORS.edgeWood}
          map={edgeMap}
          roughness={0.72}
          metalness={0.05}
        />
        <meshStandardMaterial
          attach="material-2"
          map={topMap ?? undefined}
          color="#ffffff"
          roughness={0.58}
          metalness={0.06}
        />
        <meshStandardMaterial
          attach="material-3"
          color={BOARD_COLORS.baseWood}
          roughness={0.9}
        />
        <meshStandardMaterial
          attach="material-4"
          color={BOARD_COLORS.edgeWood}
          map={edgeMap}
          roughness={0.72}
          metalness={0.05}
        />
        <meshStandardMaterial
          attach="material-5"
          color={BOARD_COLORS.edgeWood}
          map={edgeMap}
          roughness={0.72}
          metalness={0.05}
        />
      </mesh>

      {/* printed grid + palace diagonals */}
      <group>
        {lines.map((l) => (
          <mesh
            key={l.key}
            geometry={unitPlane}
            material={lineMaterial}
            position={[l.x, LINE_Y, l.z]}
            rotation={[-Math.PI / 2, 0, l.angle]}
            scale={[l.length, l.width, 1]}
          />
        ))}
      </group>

      {/* invisible pick plane */}
      <mesh
        position={[0, 0.0015, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={handleClick}
      >
        <planeGeometry args={[GRID_W + 1.2, GRID_D + 1.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default BoardMesh;
