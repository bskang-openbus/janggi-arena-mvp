/**
 * Pseudo-legal move generation per piece type.
 * Spec: docs/RULES.md section 3. "Pseudo-legal" = geometry + blocking rules only;
 * the self-check (자살수) filter lives in game.ts.
 */
import {
  FILES,
  RANKS,
  inBoard,
  inPalaceOf,
  isPalaceDiagonalPoint,
  palaceDiagonalDirs,
  palaceDiagonalNeighbors,
  pieceAt,
} from "./board.js";
import type { Board, Piece, Side, Square } from "./types.js";

const ORTHO: Array<{ df: number; dr: number }> = [
  { df: 1, dr: 0 },
  { df: -1, dr: 0 },
  { df: 0, dr: 1 },
  { df: 0, dr: -1 },
];

const DIAG: Array<{ df: number; dr: number }> = [
  { df: 1, dr: 1 },
  { df: 1, dr: -1 },
  { df: -1, dr: 1 },
  { df: -1, dr: -1 },
];

/** Successive squares reachable from `from` walking direction `dir` along palace diagonals. */
function palaceDiagonalRay(from: Square, dir: { df: number; dr: number }): Square[] {
  const out: Square[] = [];
  let cur = from;
  for (;;) {
    const canStep = palaceDiagonalDirs(cur).some((d) => d.df === dir.df && d.dr === dir.dr);
    if (!canStep) break;
    cur = { file: cur.file + dir.df, rank: cur.rank + dir.dr };
    out.push(cur);
  }
  return out;
}

function push(out: Square[], board: Board, side: Side, sq: Square): void {
  const target = pieceAt(board, sq);
  if (!target || target.side !== side) out.push(sq);
}

/* --------------------------------------------------------------- 차 (車) */

function chariotMoves(board: Board, from: Square, side: Side): Square[] {
  const out: Square[] = [];
  for (const d of ORTHO) {
    let cur = { file: from.file + d.df, rank: from.rank + d.dr };
    while (inBoard(cur)) {
      const target = pieceAt(board, cur);
      if (!target) {
        out.push(cur);
      } else {
        if (target.side !== side) out.push(cur);
        break;
      }
      cur = { file: cur.file + d.df, rank: cur.rank + d.dr };
    }
  }
  // Palace diagonals: slide through d3→e2→f1 etc. with the usual blocking rules.
  for (const d of DIAG) {
    for (const sq of palaceDiagonalRay(from, d)) {
      const target = pieceAt(board, sq);
      if (!target) {
        out.push(sq);
        continue;
      }
      if (target.side !== side) out.push(sq);
      break;
    }
  }
  return out;
}

/* --------------------------------------------------------------- 포 (包) */

function cannonMoves(board: Board, from: Square, side: Side): Square[] {
  const out: Square[] = [];
  for (const d of ORTHO) {
    // 1) find the screen (포다리): the first piece along the ray.
    let cur = { file: from.file + d.df, rank: from.rank + d.dr };
    let screen: Piece | null = null;
    while (inBoard(cur)) {
      const p = pieceAt(board, cur);
      if (p) {
        screen = p;
        break;
      }
      cur = { file: cur.file + d.df, rank: cur.rank + d.dr };
    }
    if (!screen || screen.type === "cannon") continue; // no screen, or a cannon cannot be jumped
    // 2) beyond the screen: empty squares are moves, the first piece is a capture (never a cannon).
    cur = { file: cur.file + d.df, rank: cur.rank + d.dr };
    while (inBoard(cur)) {
      const p = pieceAt(board, cur);
      if (!p) {
        out.push(cur);
      } else {
        if (p.side !== side && p.type !== "cannon") out.push(cur);
        break;
      }
      cur = { file: cur.file + d.df, rank: cur.rank + d.dr };
    }
  }
  // Palace diagonal: corner -> (screen on the centre) -> opposite corner.
  for (const d of DIAG) {
    const ray = palaceDiagonalRay(from, d);
    let idx = 0;
    let screen: Piece | null = null;
    while (idx < ray.length) {
      const p = pieceAt(board, ray[idx]!);
      if (p) {
        screen = p;
        break;
      }
      idx++;
    }
    if (!screen || screen.type === "cannon") continue;
    for (let j = idx + 1; j < ray.length; j++) {
      const p = pieceAt(board, ray[j]!);
      if (!p) {
        out.push(ray[j]!);
      } else {
        if (p.side !== side && p.type !== "cannon") out.push(ray[j]!);
        break;
      }
    }
  }
  return out;
}

/* --------------------------------------------------------------- 마 (馬) */

function horseMoves(board: Board, from: Square, side: Side): Square[] {
  const out: Square[] = [];
  for (const leg of ORTHO) {
    const legSq = { file: from.file + leg.df, rank: from.rank + leg.dr };
    if (!inBoard(legSq) || pieceAt(board, legSq)) continue; // 멱
    for (const d of DIAG) {
      // only the two diagonals continuing outward in the leg direction
      if (leg.df !== 0 && d.df !== leg.df) continue;
      if (leg.dr !== 0 && d.dr !== leg.dr) continue;
      const dest = { file: legSq.file + d.df, rank: legSq.rank + d.dr };
      if (!inBoard(dest)) continue;
      push(out, board, side, dest);
    }
  }
  return out;
}

/* --------------------------------------------------------------- 상 (象) */

function elephantMoves(board: Board, from: Square, side: Side): Square[] {
  const out: Square[] = [];
  for (const leg of ORTHO) {
    const legSq = { file: from.file + leg.df, rank: from.rank + leg.dr };
    if (!inBoard(legSq) || pieceAt(board, legSq)) continue; // 멱 1
    for (const d of DIAG) {
      if (leg.df !== 0 && d.df !== leg.df) continue;
      if (leg.dr !== 0 && d.dr !== leg.dr) continue;
      const mid = { file: legSq.file + d.df, rank: legSq.rank + d.dr };
      if (!inBoard(mid) || pieceAt(board, mid)) continue; // 멱 2
      const dest = { file: mid.file + d.df, rank: mid.rank + d.dr };
      if (!inBoard(dest)) continue;
      push(out, board, side, dest);
    }
  }
  return out;
}

/* --------------------------------------------------------- 졸(卒)/병(兵) */

function soldierMoves(board: Board, from: Square, side: Side): Square[] {
  const out: Square[] = [];
  const forward = side === "cho" ? 1 : -1;
  const steps: Square[] = [
    { file: from.file, rank: from.rank + forward },
    { file: from.file - 1, rank: from.rank },
    { file: from.file + 1, rank: from.rank },
  ];
  for (const sq of steps) {
    if (!inBoard(sq)) continue;
    push(out, board, side, sq);
  }
  // Forward diagonal along the enemy palace's diagonal lines.
  const enemy: Side = side === "cho" ? "han" : "cho";
  if (inPalaceOf(from, enemy) && isPalaceDiagonalPoint(from)) {
    for (const sq of palaceDiagonalNeighbors(from)) {
      if (side === "cho" ? sq.rank > from.rank : sq.rank < from.rank) push(out, board, side, sq);
    }
  }
  return out;
}

/* ------------------------------------------------------- 궁(將)·사(士) */

function palaceLineMoves(board: Board, from: Square, side: Side): Square[] {
  const out: Square[] = [];
  for (const d of ORTHO) {
    const sq = { file: from.file + d.df, rank: from.rank + d.dr };
    if (!inPalaceOf(sq, side)) continue;
    push(out, board, side, sq);
  }
  for (const sq of palaceDiagonalNeighbors(from)) {
    if (!inPalaceOf(sq, side)) continue;
    push(out, board, side, sq);
  }
  return out;
}

/* ------------------------------------------------------------------ entry */

export function pseudoLegalMovesFrom(board: Board, from: Square): Square[] {
  const piece = pieceAt(board, from);
  if (!piece) return [];
  switch (piece.type) {
    case "chariot":
      return chariotMoves(board, from, piece.side);
    case "cannon":
      return cannonMoves(board, from, piece.side);
    case "horse":
      return horseMoves(board, from, piece.side);
    case "elephant":
      return elephantMoves(board, from, piece.side);
    case "soldier":
      return soldierMoves(board, from, piece.side);
    case "general":
    case "guard":
      return palaceLineMoves(board, from, piece.side);
  }
}

/** Every pseudo-legal move of `side` as (from, to) pairs. */
export function allPseudoLegalMoves(board: Board, side: Side): Array<{ from: Square; to: Square }> {
  const out: Array<{ from: Square; to: Square }> = [];
  for (let rank = 0; rank < RANKS; rank++) {
    for (let file = 0; file < FILES; file++) {
      const p = board[rank]![file];
      if (!p || p.side !== side) continue;
      const from = { file, rank };
      for (const to of pseudoLegalMovesFrom(board, from)) out.push({ from, to });
    }
  }
  return out;
}
