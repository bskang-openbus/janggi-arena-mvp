/**
 * Fast single-square attack detection used by the AI search.
 *
 * The rule engine answers "장군?" by generating every pseudo-legal enemy move
 * (game.ts / boardIsCheck). That is O(all moves) and the search needs it once per
 * candidate move, so this module answers the same question backwards from the target
 * square in O(1)-ish work. It is *derived* from movegen.ts and must stay equivalent:
 * `ai.test.ts` fuzz-checks it against the engine's own isCheck / allLegalActions.
 *
 * NOTE: `attacked()` is written for check detection, i.e. the target square holds a
 * general (never a 포). The "포는 포를 잡지 못한다" restriction on the *captured*
 * piece is therefore not modelled; the 포다리 restriction is.
 */
import {
  FILES,
  RANKS,
  inPalaceOf,
  isPalaceDiagonalPoint,
  palaceDiagonalDirs,
  palaceDiagonalNeighbors,
  pieceAt,
} from "../board.js";
import type { Board, Piece, Side, Square } from "../types.js";

const ORTHO_DR = [1, -1, 0, 0];
const ORTHO_DC = [0, 0, 1, -1];

// [dr, dc] offsets of a 마 that would land on the target.
const HORSE_DR = [2, 2, -2, -2, 1, 1, -1, -1];
const HORSE_DC = [1, -1, 1, -1, 2, -2, 2, -2];

// [dr, dc] offsets of a 상 that would land on the target.
const ELE_DR = [3, 3, -3, -3, 2, 2, -2, -2];
const ELE_DC = [2, -2, 2, -2, 3, -3, 3, -3];

function inB(r: number, c: number): boolean {
  return r >= 0 && r < RANKS && c >= 0 && c < FILES;
}

/** Squares a palace diagonal walk from `from` visits in direction `d` (mirrors movegen). */
function diagRay(from: Square, d: { df: number; dr: number }): Square[] {
  const out: Square[] = [];
  let cur = from;
  for (;;) {
    const canStep = palaceDiagonalDirs(cur).some((x) => x.df === d.df && x.dr === d.dr);
    if (!canStep) break;
    cur = { file: cur.file + d.df, rank: cur.rank + d.dr };
    out.push(cur);
  }
  return out;
}

/** Is square (r, c) attacked by any piece of `by`? */
export function attacked(board: Board, r: number, c: number, by: Side): boolean {
  /* ---- 차 (first piece on a ray) · 포 (second piece past a non-cannon screen) ---- */
  for (let i = 0; i < 4; i++) {
    const dr = ORTHO_DR[i]!;
    const dc = ORTHO_DC[i]!;
    let rr = r + dr;
    let cc = c + dc;
    let first: Piece | null = null;
    while (inB(rr, cc)) {
      const p = board[rr]![cc];
      if (p) {
        first = p;
        break;
      }
      rr += dr;
      cc += dc;
    }
    if (!first) continue;
    if (first.side === by && first.type === "chariot") return true;
    if (first.type === "cannon") continue; // 포는 포를 넘지 못한다 → no screen
    let r2 = rr + dr;
    let c2 = cc + dc;
    while (inB(r2, c2)) {
      const p = board[r2]![c2];
      if (p) {
        if (p.side === by && p.type === "cannon") return true;
        break;
      }
      r2 += dr;
      c2 += dc;
    }
  }

  /* ---- 차 · 포 along the palace diagonals ---- */
  const target: Square = { file: c, rank: r };
  if (isPalaceDiagonalPoint(target)) {
    for (const d of palaceDiagonalDirs(target)) {
      const ray = diagRay(target, d);
      let idx = -1;
      let first: Piece | null = null;
      for (let j = 0; j < ray.length; j++) {
        const p = pieceAt(board, ray[j]!);
        if (p) {
          first = p;
          idx = j;
          break;
        }
      }
      if (!first) continue;
      if (first.side === by && first.type === "chariot") return true;
      if (first.type === "cannon") continue;
      for (let j = idx + 1; j < ray.length; j++) {
        const p = pieceAt(board, ray[j]!);
        if (!p) continue;
        if (p.side === by && p.type === "cannon") return true;
        break;
      }
    }
  }

  /* ---- 마 (멱 = the orthogonal leg next to the horse) ---- */
  for (let i = 0; i < 8; i++) {
    const hr = r + HORSE_DR[i]!;
    const hc = c + HORSE_DC[i]!;
    if (!inB(hr, hc)) continue;
    const p = board[hr]![hc];
    if (!p || p.side !== by || p.type !== "horse") continue;
    const dr = HORSE_DR[i]!;
    const dc = HORSE_DC[i]!;
    const lr = hr + (dr === 2 ? -1 : dr === -2 ? 1 : 0);
    const lc = hc + (dc === 2 ? -1 : dc === -2 ? 1 : 0);
    if (!board[lr]![lc]) return true;
  }

  /* ---- 상 (멱 2개: 직진 다리 + 첫 대각) ---- */
  for (let i = 0; i < 8; i++) {
    const er = r + ELE_DR[i]!;
    const ec = c + ELE_DC[i]!;
    if (!inB(er, ec)) continue;
    const p = board[er]![ec];
    if (!p || p.side !== by || p.type !== "elephant") continue;
    const dr = ELE_DR[i]!;
    const dc = ELE_DC[i]!;
    const sr = dr > 0 ? -1 : 1; // step from the elephant toward the target
    const sc = dc > 0 ? -1 : 1;
    let lr: number;
    let lc: number;
    if (dr === 3 || dr === -3) {
      lr = er + sr;
      lc = ec;
    } else {
      lr = er;
      lc = ec + sc;
    }
    const mr = lr + sr;
    const mc = lc + sc;
    if (!board[lr]![lc] && !board[mr]![mc]) return true;
  }

  /* ---- 졸/병 (전진 1 + 좌우 1, 그리고 상대 궁성 대각 전진) ---- */
  const back = by === "cho" ? -1 : 1; // a soldier of `by` sits one step "behind" the target
  const sr = r + back;
  if (inB(sr, c)) {
    const p = board[sr]![c];
    if (p && p.side === by && p.type === "soldier") return true;
  }
  for (const dc of [-1, 1]) {
    const cc = c + dc;
    if (!inB(r, cc)) continue;
    const p = board[r]![cc];
    if (p && p.side === by && p.type === "soldier") return true;
  }
  if (isPalaceDiagonalPoint(target)) {
    for (const n of palaceDiagonalNeighbors(target)) {
      const p = pieceAt(board, n);
      if (!p || p.side !== by || p.type !== "soldier") continue;
      const forward = by === "cho" ? r > n.rank : r < n.rank;
      // 졸의 대각 전진은 상대 궁성 안에서만 가능 (movegen.ts)
      if (forward && inPalaceOf(n, by === "cho" ? "han" : "cho")) return true;
    }
  }

  /* ---- 궁/사 (궁성 선 위 1칸; 도착점이 그 기물 진영의 궁성이어야 한다) ---- */
  if (inPalaceOf(target, by)) {
    for (let i = 0; i < 4; i++) {
      const nr = r + ORTHO_DR[i]!;
      const nc = c + ORTHO_DC[i]!;
      if (!inB(nr, nc)) continue;
      const p = board[nr]![nc];
      if (p && p.side === by && (p.type === "general" || p.type === "guard")) return true;
    }
    if (isPalaceDiagonalPoint(target)) {
      for (const n of palaceDiagonalNeighbors(target)) {
        const p = pieceAt(board, n);
        if (p && p.side === by && (p.type === "general" || p.type === "guard")) return true;
      }
    }
  }

  return false;
}
