/**
 * Game state, legality filtering (자살수), check / checkmate, draws (빅장·반복), perft.
 * Spec: docs/RULES.md section 4 + docs/ENGINE_API.md "판정 의무".
 */
import {
  FILES,
  RANKS,
  cloneBoard,
  findGeneral,
  initialBoard,
  opponent,
  pieceAt,
  sameSquare,
  toNotation,
} from "./board.js";
import { allPseudoLegalMoves, pseudoLegalMovesFrom } from "./movegen.js";
import type { Action, AppliedAction, Board, GameResult, GameState, Piece, Side, Square } from "./types.js";
import { EngineError } from "./types.js";

const PIECE_CHAR: Record<Piece["type"], string> = {
  general: "g",
  guard: "s",
  chariot: "r",
  cannon: "c",
  horse: "h",
  elephant: "e",
  soldier: "p",
};

/** Position identity for the repetition rule = layout + side to move (RULES.md 4절). */
export function positionKey(board: Board, turn: Side): string {
  let s = "";
  for (let rank = 0; rank < RANKS; rank++) {
    for (let file = 0; file < FILES; file++) {
      const p = board[rank]![file];
      if (!p) {
        s += ".";
      } else {
        const ch = PIECE_CHAR[p.type];
        s += p.side === "cho" ? ch : ch.toUpperCase();
      }
    }
  }
  return `${s}|${turn}`;
}

function makeState(
  board: Board,
  turn: Side,
  history: ReadonlyArray<AppliedAction>,
  result: GameResult | null,
  positionCounts: ReadonlyMap<string, number>,
): GameState {
  return { board, turn, history, result, positionCounts };
}

export function initialState(): GameState {
  const board = initialBoard();
  const counts = new Map<string, number>([[positionKey(board, "cho"), 1]]);
  return makeState(board, "cho", [], null, counts);
}

/** Build a state for tests / fixtures without replaying a game. */
export function stateFrom(board: Board, turn: Side): GameState {
  const counts = new Map<string, number>([[positionKey(board, turn), 1]]);
  return makeState(board, turn, [], null, counts);
}

/* ------------------------------------------------------------ check logic */

/** Is `side`'s general currently attacked? (Two generals never attack each other — 빅장은 무승부 처리) */
export function isCheck(state: GameState, side: Side): boolean {
  return boardIsCheck(state.board, side);
}

function boardIsCheck(board: Board, side: Side): boolean {
  const general = findGeneral(board, side);
  if (!general) return false;
  for (const mv of allPseudoLegalMoves(board, opponent(side))) {
    if (sameSquare(mv.to, general)) return true;
  }
  return false;
}

function applyMoveToBoard(board: Board, from: Square, to: Square): { board: Board; captured: Piece | null } {
  const next = cloneBoard(board);
  const moving = next[from.rank]![from.file]!;
  const captured = next[to.rank]![to.file] ?? null;
  next[to.rank]![to.file] = moving;
  next[from.rank]![from.file] = null;
  return { board: next, captured };
}

/** 빅장: the two generals share a file with nothing between them. */
export function isFacing(board: Board): boolean {
  const cho = findGeneral(board, "cho");
  const han = findGeneral(board, "han");
  if (!cho || !han) return false;
  if (cho.file !== han.file) return false;
  const lo = Math.min(cho.rank, han.rank);
  const hi = Math.max(cho.rank, han.rank);
  for (let r = lo + 1; r < hi; r++) {
    if (board[r]![cho.file]) return false;
  }
  return true;
}

/* -------------------------------------------------------- legality / gen */

export function legalMovesFrom(state: GameState, from: Square): Square[] {
  if (state.result) return [];
  const piece = pieceAt(state.board, from);
  if (!piece || piece.side !== state.turn) return [];
  return pseudoLegalMovesFrom(state.board, from).filter(
    (to) => !boardIsCheck(applyMoveToBoard(state.board, from, to).board, piece.side),
  );
}

export function allLegalActions(state: GameState): Action[] {
  if (state.result) return [];
  const out: Action[] = [];
  for (const mv of allPseudoLegalMoves(state.board, state.turn)) {
    if (boardIsCheck(applyMoveToBoard(state.board, mv.from, mv.to).board, state.turn)) continue;
    out.push({ kind: "move", move: { from: mv.from, to: mv.to } });
  }
  // 한수쉼: legal unless currently in check.
  if (!isCheck(state, state.turn)) out.push({ kind: "pass" });
  return out;
}

export function isLegal(state: GameState, action: Action): boolean {
  if (state.result) return false;
  if (action.kind === "pass") return !isCheck(state, state.turn);
  const { from, to } = action.move;
  return legalMovesFrom(state, from).some((sq) => sameSquare(sq, to));
}

/** 장군 상태 + 합법 수 0 (패스 불가) = 외통. */
export function isCheckmate(state: GameState): boolean {
  if (!isCheck(state, state.turn)) return false;
  return allLegalActions(state).length === 0;
}

/* ------------------------------------------------------------ applyAction */

export function applyAction(state: GameState, action: Action): GameState {
  if (state.result) throw new EngineError("game is already over");
  if (action.kind === "pass") {
    if (isCheck(state, state.turn)) throw new EngineError("cannot pass while in check (장군 상태에서 패스 불가)");
  } else {
    if (!isLegal(state, action)) {
      throw new EngineError(
        `illegal move: ${toNotation(action.move.from)}${toNotation(action.move.to)} for ${state.turn}`,
      );
    }
  }

  const mover = state.turn;
  const nextTurn = opponent(mover);
  let board = state.board;
  let captured: Piece | null = null;
  if (action.kind === "move") {
    const applied = applyMoveToBoard(state.board, action.move.from, action.move.to);
    board = applied.board;
    captured = applied.captured;
  }

  const check = boardIsCheck(board, nextTurn);
  const key = positionKey(board, nextTurn);
  const counts = new Map(state.positionCounts);
  const occurrences = (counts.get(key) ?? 0) + 1;
  counts.set(key, occurrences);

  const applied: AppliedAction = {
    action,
    captured,
    check,
    notation:
      action.kind === "pass" ? "pass" : `${toNotation(action.move.from)}${toNotation(action.move.to)}`,
  };

  const probe = makeState(board, nextTurn, [...state.history, applied], null, counts);

  // 판정 의무 순서 (docs/ENGINE_API.md): 1) 외통 2) 빅장 무승부 3) 3회 반복 무승부
  let result: GameResult | null = null;
  if (check && allLegalActions(probe).length === 0) {
    result = { type: "checkmate", winner: mover };
  } else if (isFacing(board)) {
    result = { type: "draw", reason: "facing" };
  } else if (occurrences >= 3) {
    result = { type: "draw", reason: "repetition" };
  }

  return makeState(board, nextTurn, probe.history, result, counts);
}

/* ------------------------------------------------------------------ perft */

/**
 * Counts the number of distinct legal action sequences of exactly `depth` plies.
 * Actions include 한수쉼(pass), matching allLegalActions(). Terminal nodes contribute 0.
 */
export function perft(state: GameState, depth: number): number {
  if (depth <= 0) return 1;
  const actions = allLegalActions(state);
  if (depth === 1) return actions.length;
  let total = 0;
  for (const action of actions) {
    total += perft(applyAction(state, action), depth - 1);
  }
  return total;
}
