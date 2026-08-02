/**
 * Presentation-layer types for the 3D board.
 *
 * IMPORTANT: this module deliberately does NOT import from `packages/engine`.
 * The visual layer is engine-agnostic; these are structurally identical
 * re-declarations of the engine contract (docs/ENGINE_API.md) so that the
 * P2 integration owner can pass engine values straight through as props.
 */

/** 초(cho, plays first) / 한(han) */
export type Side = "cho" | "han";

export type PieceType =
  | "general" // 궁 (楚 / 漢)
  | "guard" // 사 (士)
  | "chariot" // 차 (車)
  | "cannon" // 포 (包)
  | "horse" // 마 (馬)
  | "elephant" // 상 (象)
  | "soldier"; // 졸(卒) / 병(兵)

/**
 * A single piece to draw.
 * `file` 0..8 (a..i, left→right from 초's point of view),
 * `rank` 0..9 (0 = 초 side rank 1, 9 = 한 side rank 10).
 */
export interface PieceView {
  id: string;
  side: Side;
  type: PieceType;
  file: number;
  rank: number;
}

/** An intersection on the board. file 0..8, rank 0..9. */
export interface SquareRef {
  file: number;
  rank: number;
}
