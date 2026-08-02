/**
 * Janggi (Korean chess) rule engine — public API.
 * Contract: docs/ENGINE_API.md. Rules: docs/RULES.md. Zero runtime dependencies, pure functions.
 */
export const ENGINE_NAME = "janggi-engine";
export const ENGINE_VERSION = "1.0.0";

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
} from "./types.js";
export { EngineError } from "./types.js";

export {
  FILES,
  RANKS,
  boardFrom,
  cloneBoard,
  emptyBoard,
  findGeneral,
  forEachPiece,
  inAnyPalace,
  inBoard,
  inPalaceOf,
  initialBoard,
  isPalaceDiagonalPoint,
  opponent,
  palaceDiagonalNeighbors,
  palaceOf,
  parseNotation,
  pieceAt,
  sameSquare,
  toNotation,
} from "./board.js";

export { allPseudoLegalMoves, pseudoLegalMovesFrom } from "./movegen.js";

export {
  allLegalActions,
  applyAction,
  initialState,
  isCheck,
  isCheckmate,
  isFacing,
  isLegal,
  legalMovesFrom,
  perft,
  positionKey,
  stateFrom,
} from "./game.js";
