import {
  FILE_COUNT,
  RANK_COUNT,
  squareKey,
} from "@/src/components/board/layout";
import type {
  PieceType,
  PieceView,
  SquareRef,
} from "@/src/components/board/types";

/**
 * Hard-coded 마상상마 opening layout (docs/RULES.md 2절), used only to drive
 * the visual demo page. The real board state comes from the rules engine once
 * P2 integration wires it up.
 */
type Spec = [file: number, rank: number, type: PieceType];

const CHO: Spec[] = [
  [0, 0, "chariot"],
  [1, 0, "horse"],
  [2, 0, "elephant"],
  [3, 0, "guard"],
  [5, 0, "guard"],
  [6, 0, "elephant"],
  [7, 0, "horse"],
  [8, 0, "chariot"],
  [4, 1, "general"],
  [1, 2, "cannon"],
  [7, 2, "cannon"],
  [0, 3, "soldier"],
  [2, 3, "soldier"],
  [4, 3, "soldier"],
  [6, 3, "soldier"],
  [8, 3, "soldier"],
];

const HAN: Spec[] = [
  [0, 9, "chariot"],
  [1, 9, "horse"],
  [2, 9, "elephant"],
  [3, 9, "guard"],
  [5, 9, "guard"],
  [6, 9, "elephant"],
  [7, 9, "horse"],
  [8, 9, "chariot"],
  [4, 8, "general"],
  [1, 7, "cannon"],
  [7, 7, "cannon"],
  [0, 6, "soldier"],
  [2, 6, "soldier"],
  [4, 6, "soldier"],
  [6, 6, "soldier"],
  [8, 6, "soldier"],
];

export function createInitialPieces(): PieceView[] {
  const out: PieceView[] = [];
  const count = new Map<string, number>();
  const push = (side: "cho" | "han", specs: Spec[]) => {
    for (const [file, rank, type] of specs) {
      const k = `${side}-${type}`;
      const n = (count.get(k) ?? 0) + 1;
      count.set(k, n);
      out.push({ id: `${k}-${n}`, side, type, file, rank });
    }
  };
  push("cho", CHO);
  push("han", HAN);
  return out;
}

/** id of the 초 cannon on b3 — the demo's "select me" target. */
export const DEMO_FOCUS_ID = "cho-cannon-1";

/** Scripted demo step (초 졸 e4 → e5) used to show the last-move afterglow. */
export const DEMO_MOVE = {
  from: { file: 4, rank: 3 },
  to: { file: 4, rank: 4 },
} as const;

/**
 * VISUAL STUB ONLY — not the rules engine. Sprays a handful of plausible
 * destinations around the selected piece so the highlight / capture markers
 * can be seen. Rays stop on the first occupied intersection and include it,
 * which is enough to exercise the "capture" marker colour.
 */
export function stubHighlights(
  pieces: PieceView[],
  selected: PieceView,
): SquareRef[] {
  const occupied = new Map<string, PieceView>();
  for (const p of pieces) occupied.set(squareKey(p), p);

  const long = selected.type === "chariot" || selected.type === "cannon";
  const reach = long ? 6 : selected.type === "soldier" ? 1 : 2;
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  if (selected.type === "general" || selected.type === "guard") {
    dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
  }

  const out: SquareRef[] = [];
  const seen = new Set<string>();

  for (const [df, dr] of dirs) {
    for (let step = 1; step <= reach; step += 1) {
      const file = selected.file + df * step;
      const rank = selected.rank + dr * step;
      if (file < 0 || file >= FILE_COUNT || rank < 0 || rank >= RANK_COUNT) {
        break;
      }
      const sq = { file, rank };
      const key = squareKey(sq);
      const here = occupied.get(key);
      if (here && here.side === selected.side) break;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(sq);
      }
      if (here) break; // capture ends the ray
    }
  }

  return out;
}
