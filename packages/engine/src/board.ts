/**
 * Board representation, coordinate system, palace geometry and initial setup.
 * Spec: docs/RULES.md sections 1~2.
 */
import type { Board, Piece, PieceType, Side, Square } from "./types.js";
import { EngineError } from "./types.js";

export const FILES = 9; // a..i
export const RANKS = 10; // 1..10

const FILE_LETTERS = "abcdefghi";

export function inBoard(sq: Square): boolean {
  return sq.file >= 0 && sq.file < FILES && sq.rank >= 0 && sq.rank < RANKS;
}

export function sameSquare(a: Square, b: Square): boolean {
  return a.file === b.file && a.rank === b.rank;
}

export function toNotation(sq: Square): string {
  if (!inBoard(sq)) throw new EngineError(`square out of board: ${JSON.stringify(sq)}`);
  return `${FILE_LETTERS[sq.file]}${sq.rank + 1}`;
}

export function parseNotation(s: string): Square {
  const m = /^([a-i])(10|[1-9])$/.exec(s);
  if (!m) throw new EngineError(`invalid notation: ${s}`);
  return { file: FILE_LETTERS.indexOf(m[1]!), rank: Number(m[2]) - 1 };
}

export function pieceAt(board: Board, sq: Square): Piece | null {
  if (!inBoard(sq)) return null;
  return board[sq.rank]![sq.file]!;
}

export function emptyBoard(): Board {
  return Array.from({ length: RANKS }, () => Array.from({ length: FILES }, () => null));
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice());
}

/* ------------------------------------------------------------------ palace */

/** Palace rank range per side: cho = ranks 1..3 (idx 0..2), han = ranks 8..10 (idx 7..9). */
export function palaceOf(side: Side): { minFile: number; maxFile: number; minRank: number; maxRank: number } {
  return side === "cho"
    ? { minFile: 3, maxFile: 5, minRank: 0, maxRank: 2 }
    : { minFile: 3, maxFile: 5, minRank: 7, maxRank: 9 };
}

export function inPalaceOf(sq: Square, side: Side): boolean {
  const p = palaceOf(side);
  return sq.file >= p.minFile && sq.file <= p.maxFile && sq.rank >= p.minRank && sq.rank <= p.maxRank;
}

/** In either palace (a chariot/cannon may use the diagonals of the enemy palace too). */
export function inAnyPalace(sq: Square): boolean {
  return inPalaceOf(sq, "cho") || inPalaceOf(sq, "han");
}

/**
 * The palace diagonals form an X: four corners + the centre.
 * Only those five points carry a diagonal line (d2 / e1 ... have none).
 */
export function isPalaceDiagonalPoint(sq: Square): boolean {
  if (!inAnyPalace(sq)) return false;
  const p = inPalaceOf(sq, "cho") ? palaceOf("cho") : palaceOf("han");
  const centreFile = p.minFile + 1;
  const centreRank = p.minRank + 1;
  if (sq.file === centreFile && sq.rank === centreRank) return true;
  const isCornerFile = sq.file === p.minFile || sq.file === p.maxFile;
  const isCornerRank = sq.rank === p.minRank || sq.rank === p.maxRank;
  return isCornerFile && isCornerRank;
}

export function isPalaceCentre(sq: Square): boolean {
  return isPalaceDiagonalPoint(sq) && sq.file === 4 && (sq.rank === 1 || sq.rank === 8);
}

/** Diagonal step directions available from `sq` along a palace diagonal line. */
export function palaceDiagonalDirs(sq: Square): Array<{ df: number; dr: number }> {
  if (!isPalaceDiagonalPoint(sq)) return [];
  const dirs: Array<{ df: number; dr: number }> = [];
  for (const df of [-1, 1]) {
    for (const dr of [-1, 1]) {
      const next: Square = { file: sq.file + df, rank: sq.rank + dr };
      if (isPalaceDiagonalPoint(next) && sameSide(sq, next)) dirs.push({ df, dr });
    }
  }
  return dirs;
}

/** Both squares belong to the same palace (a diagonal never leaves its palace). */
function sameSide(a: Square, b: Square): boolean {
  return (
    (inPalaceOf(a, "cho") && inPalaceOf(b, "cho")) || (inPalaceOf(a, "han") && inPalaceOf(b, "han"))
  );
}

/** Squares diagonally connected to `sq` by one palace-diagonal step. */
export function palaceDiagonalNeighbors(sq: Square): Square[] {
  return palaceDiagonalDirs(sq).map((d) => ({ file: sq.file + d.df, rank: sq.rank + d.dr }));
}

/* ----------------------------------------------------------- initial setup */

interface Placement {
  at: string;
  type: PieceType;
  side: Side;
}

/** docs/RULES.md 2절 — fixed "마상상마" setup for both sides. */
const INITIAL_PLACEMENTS: Placement[] = [
  // 한 (top)
  { at: "a10", type: "chariot", side: "han" },
  { at: "b10", type: "horse", side: "han" },
  { at: "c10", type: "elephant", side: "han" },
  { at: "d10", type: "guard", side: "han" },
  { at: "f10", type: "guard", side: "han" },
  { at: "g10", type: "elephant", side: "han" },
  { at: "h10", type: "horse", side: "han" },
  { at: "i10", type: "chariot", side: "han" },
  { at: "e9", type: "general", side: "han" },
  { at: "b8", type: "cannon", side: "han" },
  { at: "h8", type: "cannon", side: "han" },
  { at: "a7", type: "soldier", side: "han" },
  { at: "c7", type: "soldier", side: "han" },
  { at: "e7", type: "soldier", side: "han" },
  { at: "g7", type: "soldier", side: "han" },
  { at: "i7", type: "soldier", side: "han" },
  // 초 (bottom)
  { at: "a4", type: "soldier", side: "cho" },
  { at: "c4", type: "soldier", side: "cho" },
  { at: "e4", type: "soldier", side: "cho" },
  { at: "g4", type: "soldier", side: "cho" },
  { at: "i4", type: "soldier", side: "cho" },
  { at: "b3", type: "cannon", side: "cho" },
  { at: "h3", type: "cannon", side: "cho" },
  { at: "e2", type: "general", side: "cho" },
  { at: "a1", type: "chariot", side: "cho" },
  { at: "b1", type: "horse", side: "cho" },
  { at: "c1", type: "elephant", side: "cho" },
  { at: "d1", type: "guard", side: "cho" },
  { at: "f1", type: "guard", side: "cho" },
  { at: "g1", type: "elephant", side: "cho" },
  { at: "h1", type: "horse", side: "cho" },
  { at: "i1", type: "chariot", side: "cho" },
];

export function initialBoard(): Board {
  const board = emptyBoard();
  const counters = new Map<string, number>();
  for (const p of INITIAL_PLACEMENTS) {
    const key = `${p.side}-${p.type}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    const sq = parseNotation(p.at);
    board[sq.rank]![sq.file] = { side: p.side, type: p.type, id: `${key}-${n}` };
  }
  return board;
}

/* ------------------------------------------------------------ test helpers */

/** Build a board from a `{ notation: "side type" }`-ish map. Used by tests and fixtures. */
export function boardFrom(spec: Record<string, [Side, PieceType]>): Board {
  const board = emptyBoard();
  const counters = new Map<string, number>();
  for (const [at, [side, type]] of Object.entries(spec)) {
    const key = `${side}-${type}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    const sq = parseNotation(at);
    board[sq.rank]![sq.file] = { side, type, id: `${key}-${n}` };
  }
  return board;
}

export function findGeneral(board: Board, side: Side): Square | null {
  for (let rank = 0; rank < RANKS; rank++) {
    for (let file = 0; file < FILES; file++) {
      const p = board[rank]![file];
      if (p && p.side === side && p.type === "general") return { file, rank };
    }
  }
  return null;
}

export function forEachPiece(board: Board, fn: (piece: Piece, sq: Square) => void): void {
  for (let rank = 0; rank < RANKS; rank++) {
    for (let file = 0; file < FILES; file++) {
      const p = board[rank]![file];
      if (p) fn(p, { file, rank });
    }
  }
}

export const opponent = (side: Side): Side => (side === "cho" ? "han" : "cho");
