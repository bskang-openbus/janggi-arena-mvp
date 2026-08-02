/**
 * Public types for the Janggi rule engine.
 * Contract source: docs/ENGINE_API.md (do not change signatures without a DECISIONS.md entry).
 */

export type Side = "cho" | "han";

export type PieceType =
  | "general" // 궁 (楚王/漢王)
  | "guard" // 사 (士)
  | "chariot" // 차 (車)
  | "cannon" // 포 (包)
  | "horse" // 마 (馬)
  | "elephant" // 상 (象)
  | "soldier"; // 졸(초 卒) / 병(한 兵)

export interface Piece {
  side: Side;
  type: PieceType;
  /** Unique, assigned at initial setup (used by the web layer to track capture VFX). */
  id: string;
}

/** file 0..8 ('a'..'i'), rank 0..9 ('1'..'10'). rank 0 is the Cho (bottom) side. */
export interface Square {
  file: number;
  rank: number;
}

/** board[rank][file]; rank 0 === notation rank "1". */
export type Board = (Piece | null)[][];

export interface Move {
  from: Square;
  to: Square;
}

export type Action = { kind: "move"; move: Move } | { kind: "pass" };

export type GameResult =
  | { type: "checkmate"; winner: Side }
  | { type: "draw"; reason: "facing" | "repetition" };

export interface AppliedAction {
  action: Action;
  captured: Piece | null;
  /** true when the side to move *after* this action is in check. */
  check: boolean;
  /** "e2e3" for moves, "pass" for a pass. */
  notation: string;
}

export interface GameState {
  board: Board;
  turn: Side;
  readonly history: ReadonlyArray<AppliedAction>;
  result: GameResult | null;
  /**
   * Repetition bookkeeping: position key (layout + side to move) -> occurrence count.
   * Kept on the state so the engine stays a set of pure functions.
   */
  readonly positionCounts: ReadonlyMap<string, number>;
}

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}
