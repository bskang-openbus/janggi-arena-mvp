import type { PieceType, SquareRef } from "./types";

/** 9 files (a..i) x 10 ranks (1..10); pieces sit on the intersections. */
export const FILE_COUNT = 9;
export const RANK_COUNT = 10;

/** World units between two neighbouring intersections. */
export const SPACING = 1;

/** Playable area, from the outermost lines. */
export const GRID_W = (FILE_COUNT - 1) * SPACING; // 8
export const GRID_D = (RANK_COUNT - 1) * SPACING; // 9

/** Wooden margin around the printed grid. */
export const BOARD_MARGIN = 0.9;
export const BOARD_W = GRID_W + BOARD_MARGIN * 2;
export const BOARD_D = GRID_D + BOARD_MARGIN * 2;

/** Plate thickness (the visible slab) and the base step underneath it. */
export const BOARD_THICKNESS = 0.44;
export const BASE_THICKNESS = 0.16;
export const BASE_OVERHANG = 0.16;

/** The playing surface sits at y = 0; everything else hangs below. */
export const SURFACE_Y = 0;

/** Small lifts used to avoid z-fighting on the flat surface. */
export const LINE_Y = 0.004;
export const MARKER_Y = 0.012;
export const TRAIL_Y = 0.009;

/** Palace (궁성) extents, inclusive, in board indices. */
export const PALACE = {
  fileMin: 3, // d
  fileMax: 5, // f
  cho: { rankMin: 0, rankMax: 2 }, // ranks 1..3
  han: { rankMin: 7, rankMax: 9 }, // ranks 8..10
} as const;

/**
 * Board index → world position.
 * +X is 초's right (file a→i), −Z points away from 초 (rank 1→10),
 * so with the default camera 초 sits at the bottom of the screen.
 */
export function squareToWorld(
  file: number,
  rank: number,
): [number, number, number] {
  return [
    (file - (FILE_COUNT - 1) / 2) * SPACING,
    SURFACE_Y,
    -(rank - (RANK_COUNT - 1) / 2) * SPACING,
  ];
}

/** Nearest intersection to a world-space point on the surface (clamped). */
export function worldToSquare(x: number, z: number): SquareRef {
  const file = Math.round(x / SPACING + (FILE_COUNT - 1) / 2);
  const rank = Math.round(-z / SPACING + (RANK_COUNT - 1) / 2);
  return {
    file: Math.min(FILE_COUNT - 1, Math.max(0, file)),
    rank: Math.min(RANK_COUNT - 1, Math.max(0, rank)),
  };
}

export function sameSquare(a: SquareRef, b: SquareRef): boolean {
  return a.file === b.file && a.rank === b.rank;
}

export function squareKey(sq: SquareRef): string {
  return `${sq.file}:${sq.rank}`;
}

/**
 * Size hierarchy required by the visual spec:
 * 궁 > 차·포·마·상 > 사·졸.
 */
export interface PieceMetrics {
  radius: number;
  height: number;
}

const MAJOR: PieceMetrics = { radius: 0.365, height: 0.36 };
const MINOR: PieceMetrics = { radius: 0.305, height: 0.3 };

export const PIECE_METRICS: Record<PieceType, PieceMetrics> = {
  general: { radius: 0.425, height: 0.44 },
  chariot: MAJOR,
  cannon: MAJOR,
  horse: MAJOR,
  elephant: MAJOR,
  guard: MINOR,
  soldier: MINOR,
};
