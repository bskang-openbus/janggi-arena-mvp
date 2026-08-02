/**
 * Single import seam for `packages/engine`.
 *
 * The engine ships raw TypeScript sources (`exports["."] === "./src/index.ts"`) because
 * apps/web compiles it through Next's `transpilePackages`. Node cannot execute that, so the
 * engine also exposes a compiled ESM build under the `engine/dist` subpath
 * (`pnpm -F engine build`). Every server module imports the engine through this file, so the
 * consumption strategy lives in exactly one place (and vitest can alias it back to the sources).
 */
export {
  EngineError,
  allLegalActions,
  applyAction,
  boardFrom,
  findGeneral,
  forEachPiece,
  initialState,
  isCheck,
  isCheckmate,
  isFacing,
  isLegal,
  legalMovesFrom,
  opponent,
  parseNotation,
  stateFrom,
  toNotation,
} from "engine/dist";

export type {
  Action,
  AppliedAction,
  Board,
  GameResult,
  GameState,
  Move,
  Piece,
  PieceType,
  Side,
  Square,
} from "engine/dist";
