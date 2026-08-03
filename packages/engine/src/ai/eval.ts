/**
 * Static evaluation. Units are centi-points: 100 = 1 기물점 (졸 = 200).
 * Material scale: 대한장기협회 통용 점수 — 차13 포7 마5 상3 사3 졸병2, 궁은 승패로만 (0).
 * Positional terms are deliberately small (≤ ~0.3 기물점) so material always dominates.
 */
import { FILES, RANKS } from "../board.js";
import type { Board, PieceType, Side } from "../types.js";

export const PIECE_VALUE: Record<PieceType, number> = {
  chariot: 1300,
  cannon: 700,
  horse: 500,
  elephant: 300,
  guard: 300,
  soldier: 200,
  general: 0,
};

/** Mate scores stay far away from any material sum (max material ≈ 7200). */
export const MATE = 1_000_000;
export const DRAW = 0;
export const INF = 1 << 30;

export interface EvalWeights {
  /** per 한 칸 전진 of a 졸/병 */
  soldierAdvance: number;
  /** 중앙 3파일(d~f)로 전진한 졸 */
  soldierCentral: number;
  /** 마/상이 초기 진영 라인을 떠났을 때 */
  develop: number;
  /** 궁에 붙어 있는 사 (궁성 수비) */
  guardShield: number;
  /** 차의 직선 활로 1칸당 (기동력) */
  chariotMobility: number;
}

export const DEFAULT_WEIGHTS: EvalWeights = {
  soldierAdvance: 8,
  soldierCentral: 6,
  develop: 8,
  guardShield: 10,
  chariotMobility: 4,
};

const CH_DR = [1, -1, 0, 0];
const CH_DC = [0, 0, 1, -1];

/** Open orthogonal squares (plus one capture) around a 차 — cheap 기동력 proxy. */
function chariotMobility(board: Board, r: number, c: number, side: Side): number {
  let n = 0;
  for (let i = 0; i < 4; i++) {
    const dr = CH_DR[i]!;
    const dc = CH_DC[i]!;
    let rr = r + dr;
    let cc = c + dc;
    while (rr >= 0 && rr < RANKS && cc >= 0 && cc < FILES) {
      const p = board[rr]![cc];
      if (p) {
        if (p.side !== side) n++;
        break;
      }
      n++;
      rr += dr;
      cc += dc;
    }
  }
  return n;
}

/**
 * Evaluation of `board` from `side`'s point of view (positive = good for `side`).
 * Pure function of the board — no history, no turn-dependent terms.
 */
export function evaluate(board: Board, side: Side, w: EvalWeights = DEFAULT_WEIGHTS): number {
  let cho = 0;
  let han = 0;
  let choGenR = -1;
  let choGenC = -1;
  let hanGenR = -1;
  let hanGenC = -1;
  // at most 2 guards per side; store as r*9+c
  const choGuards: number[] = [];
  const hanGuards: number[] = [];

  for (let r = 0; r < RANKS; r++) {
    const row = board[r]!;
    for (let c = 0; c < FILES; c++) {
      const p = row[c];
      if (!p) continue;
      const isCho = p.side === "cho";
      let v = PIECE_VALUE[p.type];
      switch (p.type) {
        case "soldier": {
          const adv = isCho ? r - 3 : 6 - r;
          if (adv > 0) {
            v += w.soldierAdvance * adv;
            if (c >= 3 && c <= 5) v += w.soldierCentral;
          }
          break;
        }
        case "horse":
        case "elephant":
          if (isCho ? r > 0 : r < RANKS - 1) v += w.develop;
          break;
        case "chariot":
          if (w.chariotMobility > 0) v += w.chariotMobility * chariotMobility(board, r, c, p.side);
          break;
        case "guard":
          (isCho ? choGuards : hanGuards).push(r * FILES + c);
          break;
        case "general":
          if (isCho) {
            choGenR = r;
            choGenC = c;
          } else {
            hanGenR = r;
            hanGenC = c;
          }
          break;
        default:
          break;
      }
      if (isCho) cho += v;
      else han += v;
    }
  }

  if (w.guardShield > 0) {
    for (const g of choGuards) {
      if (choGenR < 0) break;
      const gr = (g / FILES) | 0;
      const gc = g % FILES;
      if (Math.abs(gr - choGenR) <= 1 && Math.abs(gc - choGenC) <= 1) cho += w.guardShield;
    }
    for (const g of hanGuards) {
      if (hanGenR < 0) break;
      const gr = (g / FILES) | 0;
      const gc = g % FILES;
      if (Math.abs(gr - hanGenR) <= 1 && Math.abs(gc - hanGenC) <= 1) han += w.guardShield;
    }
  }

  const diff = cho - han;
  return side === "cho" ? diff : -diff;
}

/** Total material on the board for `side` (used by tests / adjudication). */
export function materialOf(board: Board, side: Side): number {
  let sum = 0;
  for (let r = 0; r < RANKS; r++) {
    for (let c = 0; c < FILES; c++) {
      const p = board[r]![c];
      if (p && p.side === side) sum += PIECE_VALUE[p.type];
    }
  }
  return sum;
}
