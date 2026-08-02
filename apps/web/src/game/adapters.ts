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

/* ------------------------------------------------------------------ */
/* 온라인 대국 (P5) — 서버 스냅샷 → 화면 데이터                          */
/* ------------------------------------------------------------------ */

/**
 * 서버 스냅샷의 `captured[side]` (그 진영이 *잃은* 기물)를 잡힌 말 목록으로
 * 묶는다. 로컬의 `capturedBy`는 history에서 파생하지만, 온라인은 history가
 * 없고 서버가 계산한 목록이 진실이다.
 */
export function groupCaptured(pieces: readonly Piece[]): CapturedGroup[] {
  const groups = new Map<string, CapturedGroup>();
  for (const victim of pieces) {
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

/** `describeAction`의 온라인판 — 입력이 engine history 대신 서버 LastAction. */
export function describeLastAction(
  last: {
    side: Side;
    kind: "move" | "pass";
    from: Square | null;
    to: Square | null;
    captured: Piece | null;
    check: boolean;
    auto: boolean;
  },
  boardAfter: Board,
): string {
  const who = SIDE_LABEL[last.side];
  if (last.kind === "pass" || !last.from || !last.to) {
    return `${who} 한수쉼${last.auto ? " (시간 초과 자동)" : ""}`;
  }
  const moved = pieceAtSquare(boardAfter, last.to);
  const head = `${who}${moved ? ` ${glyphOf(moved)}` : ""}`;
  const tail = last.captured
    ? ` (${glyphOf(last.captured)} 포획)`
    : last.check
      ? " 장군!"
      : "";
  return `${head} ${toNotation(last.from)}→${toNotation(last.to)}${tail}`;
}

/** 서버 판정(기권·시간초과·몰수)을 포함한 결과 문구. */
export function matchResultLabel(
  result: {
    type: "checkmate" | "draw" | "resign" | "timeout" | "forfeit";
    winner?: Side;
    loser?: Side;
    reason?: string;
  },
  mySide: Side | null,
): { title: string; detail: string; outcome: "win" | "lose" | "draw" } {
  if (result.type === "draw") {
    return {
      title: "무승부",
      detail:
        result.reason === "facing"
          ? "빅장 — 두 궁이 마주 봄"
          : "동일 국면 3회 반복",
      outcome: "draw",
    };
  }
  const winner = result.winner ?? "cho";
  const loser: Side = winner === "cho" ? "han" : "cho";
  const detail =
    result.type === "checkmate"
      ? "외통 (장군을 벗어날 수 없음)"
      : result.type === "resign"
        ? `${SIDE_LABEL[loser]} 기권`
        : result.type === "timeout"
          ? `${SIDE_LABEL[loser]} 시간 초과 — 장군 상태에서는 한수쉼을 할 수 없습니다`
          : `${SIDE_LABEL[loser]} 자동 한수쉼 누적 (시간 초과 반복)`;
  return {
    title: `${SIDE_LABEL[winner]} 승`,
    detail,
    outcome: mySide === null ? "draw" : mySide === winner ? "win" : "lose",
  };
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
