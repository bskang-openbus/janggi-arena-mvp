/** Position builders for the server tests (mirrors packages/engine's internal test helper). */
import {
  type GameState,
  type PieceType,
  type Side,
  type Square,
  boardFrom,
  parseNotation,
  stateFrom,
} from "../engine.js";

export type Spec = Record<string, [Side, PieceType]>;

/** Builds a position; generals default to e2 (초) / e9 (한) exactly like RULES.md 5절. */
export function pos(spec: Spec, turn: Side = "cho"): GameState {
  const withGenerals: Spec = { ...spec };
  const hasCho = Object.values(spec).some(([s, t]) => s === "cho" && t === "general");
  const hasHan = Object.values(spec).some(([s, t]) => s === "han" && t === "general");
  if (!hasCho && !withGenerals["e2"]) withGenerals["e2"] = ["cho", "general"];
  if (!hasHan && !withGenerals["e9"]) withGenerals["e9"] = ["han", "general"];
  return stateFrom(boardFrom(withGenerals), turn);
}

export const sq = (notation: string): Square => parseNotation(notation);
