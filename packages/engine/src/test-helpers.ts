/** Shared helpers for the engine test suites (not part of the public API). */
import { boardFrom, parseNotation, toNotation } from "./board.js";
import { stateFrom, legalMovesFrom } from "./game.js";
import { pseudoLegalMovesFrom } from "./movegen.js";
import type { GameState, PieceType, Side, Square } from "./types.js";

export type Spec = Record<string, [Side, PieceType]>;

/** Build a position. Generals default to e2 (cho) / e9 (han) per RULES.md 5절. */
export function pos(spec: Spec, turn: Side = "cho", opts: { generals?: boolean } = {}): GameState {
  const withGenerals: Spec = { ...spec };
  if (opts.generals !== false) {
    const hasCho = Object.values(spec).some(([s, t]) => s === "cho" && t === "general");
    const hasHan = Object.values(spec).some(([s, t]) => s === "han" && t === "general");
    if (!hasCho && !withGenerals["e2"]) withGenerals["e2"] = ["cho", "general"];
    if (!hasHan && !withGenerals["e9"]) withGenerals["e9"] = ["han", "general"];
  }
  return stateFrom(boardFrom(withGenerals), turn);
}

export const sq = (n: string): Square => parseNotation(n);

/** Sorted legal destinations (self-check filtered) for the piece on `from`. */
export function legal(state: GameState, from: string): string[] {
  return legalMovesFrom(state, sq(from)).map(toNotation).sort();
}

/** Sorted pseudo-legal destinations (geometry only). */
export function pseudo(state: GameState, from: string): string[] {
  return pseudoLegalMovesFrom(state.board, sq(from)).map(toNotation).sort();
}

export const sorted = (arr: string[]): string[] => [...arr].sort();

export const move = (from: string, to: string) =>
  ({ kind: "move", move: { from: sq(from), to: sq(to) } }) as const;

export const pass = { kind: "pass" } as const;
