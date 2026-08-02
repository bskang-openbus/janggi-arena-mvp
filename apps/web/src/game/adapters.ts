/**
 * engine ↔ presentation adapters.
 *
 * The 3D layer (`src/components/board/*`) is deliberately engine-agnostic: it
 * re-declares the contract types structurally. Everything that converts an
 * engine value into something the visual layer accepts lives here, so neither
 * side has to know about the other.
 *
 * RULE: never modify `src/components/board/types.ts` — adapt, don't couple.
 */
import type {
  AppliedAction,
  Board,
  GameResult,
  GameState,
  Piece,
  PieceType,
  Side,
  Square,
} from "engine";
import { toNotation } from "engine";
import { glyphFor } from "@/src/components/board/palette";
import type { PieceView, SquareRef } from "@/src/components/board/types";

export const SIDE_LABEL: Record<Side, string> = { cho: "초", han: "한" };

/** Human-readable piece name used in the last-move line and capture list. */
export const PIECE_LABEL: Record<PieceType, string> = {
  general: "궁",
  guard: "사",
  chariot: "차",
  cannon: "포",
  horse: "마",
  elephant: "상",
  soldier: "졸",
};

/** The hanja engraved on the 3D piece — reused so UI and board never disagree. */
export function glyphOf(piece: Pick<Piece, "type" | "side">): string {
  return glyphFor(piece.type, piece.side);
}

/** `board[rank][file]` → the flat list the scene renders. */
export function boardToPieceViews(board: Board): PieceView[] {
  const out: PieceView[] = [];
  for (let rank = 0; rank < board.length; rank += 1) {
    const row = board[rank];
    if (!row) continue;
    for (let file = 0; file < row.length; file += 1) {
      const piece = row[file];
      if (!piece) continue;
      out.push({ id: piece.id, side: piece.side, type: piece.type, file, rank });
    }
  }
  return out;
}

export function pieceAtSquare(board: Board, sq: SquareRef): Piece | null {
  return board[sq.rank]?.[sq.file] ?? null;
}

/** Locate a piece by its engine id (ids are stable for the whole game). */
export function squareOfPieceId(board: Board, id: string): Square | null {
  for (let rank = 0; rank < board.length; rank += 1) {
    const row = board[rank];
    if (!row) continue;
    for (let file = 0; file < row.length; file += 1) {
      if (row[file]?.id === id) return { file, rank };
    }
  }
  return null;
}

export function sameSquareRef(a: SquareRef, b: SquareRef): boolean {
  return a.file === b.file && a.rank === b.rank;
}

/** Last *move* (a pass has no board geometry, so it clears the trail). */
export function lastMoveOf(
  state: GameState,
): { from: SquareRef; to: SquareRef } | null {
  const last = state.history[state.history.length - 1];
  if (!last || last.action.kind !== "move") return null;
  return { from: last.action.move.from, to: last.action.move.to };
}

/** The side of the mover of `history[index]` — 초 opens, turn alternates every action. */
export function moverOf(index: number): Side {
  return index % 2 === 0 ? "cho" : "han";
}

/**
 * e.g. `초 車 a1→a7 (兵 포획)` / `한 한수쉼`.
 *
 * `moverGlyph` has to be resolved from the board *after* the move (the mover
 * now stands on `to`), which is why the caller passes the resulting state.
 */
export function describeAction(
  applied: AppliedAction,
  index: number,
  boardAfter: Board,
): string {
  const mover = moverOf(index);
  if (applied.action.kind === "pass") return `${SIDE_LABEL[mover]} 한수쉼`;
  const { from, to } = applied.action.move;
  const moved = pieceAtSquare(boardAfter, to);
  const head = `${SIDE_LABEL[mover]}${moved ? ` ${glyphOf(moved)}` : ""}`;
  const tail = applied.captured
    ? ` (${glyphOf(applied.captured)} 포획)`
    : applied.check
      ? " 장군!"
      : "";
  return `${head} ${toNotation(from)}→${toNotation(to)}${tail}`;
}

export function resultLabel(result: GameResult): {
  title: string;
  detail: string;
} {
  if (result.type === "checkmate") {
    return {
      title: `${SIDE_LABEL[result.winner]} 승`,
      detail: "외통 (장군을 벗어날 수 없음)",
    };
  }
  return {
    title: "무승부",
    detail:
      result.reason === "facing"
        ? "빅장 — 두 궁이 마주 봄"
        : "동일 국면 3회 반복",
  };
}

export interface CapturedGroup {
  type: PieceType;
  side: Side;
  glyph: string;
  count: number;
}

/**
 * Pieces `captor` has taken from the opponent, grouped by type.
 * Derived straight from `history` so it can never drift from the board.
 */
export function capturedBy(state: GameState, captor: Side): CapturedGroup[] {
  const groups = new Map<string, CapturedGroup>();
  for (const applied of state.history) {
    const victim = applied.captured;
    if (!victim || victim.side === captor) continue;
    const key = `${victim.side}-${victim.type}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, {
        type: victim.type,
        side: victim.side,
        glyph: glyphOf(victim),
        count: 1,
      });
    }
  }
  return [...groups.values()];
}
