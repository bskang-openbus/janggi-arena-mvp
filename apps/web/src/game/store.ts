"use client";

/**
 * Local 2-player match store (P2).
 *
 * The engine is the single source of truth: every mutation goes through
 * `applyAction`, and all view data is derived from the returned `GameState`.
 * Derived values are materialised into the store (rather than computed in
 * selectors) so components can subscribe to stable references.
 */
import type { GameState, Piece, Side, Square } from "engine";
import {
  applyAction,
  initialState,
  isCheck,
  isLegal,
  legalMovesFrom,
} from "engine";
import { create } from "zustand";
import type { PieceView, SquareRef } from "@/src/components/board/types";
import {
  boardToPieceViews,
  capturedBy,
  type CapturedGroup,
  describeAction,
  lastMoveOf,
  moverOf,
  pieceAtSquare,
  sameSquareRef,
  squareOfPieceId,
} from "./adapters";

export type Screen = "title" | "game";

/**
 * The most recent capture, kept as an event so P3's VFX state machine can
 * latch onto `seq` changing. P2 only records it.
 */
export interface CaptureEvent {
  /** history index of the capturing action — strictly increasing, never reused */
  seq: number;
  captured: Piece;
  captor: Side;
  /** id of the piece that did the capturing (it now stands on `at`) */
  captorPieceId: string | null;
  at: SquareRef;
}

/** Everything the view needs, recomputed once per engine transition. */
interface Derived {
  pieces: PieceView[];
  lastMove: { from: SquareRef; to: SquareRef } | null;
  lastMoveLabel: string | null;
  checkSide: Side | null;
  capturedByCho: CapturedGroup[];
  capturedByHan: CapturedGroup[];
  canPass: boolean;
}

function derive(state: GameState): Derived {
  const lastIndex = state.history.length - 1;
  const last = lastIndex >= 0 ? state.history[lastIndex] : undefined;
  // the 궁 keeps pulsing after 외통 as well — the banner is gated separately
  const inCheck = isCheck(state, state.turn);
  return {
    pieces: boardToPieceViews(state.board),
    lastMove: lastMoveOf(state),
    lastMoveLabel: last ? describeAction(last, lastIndex, state.board) : null,
    checkSide: inCheck ? state.turn : null,
    capturedByCho: capturedBy(state, "cho"),
    capturedByHan: capturedBy(state, "han"),
    canPass: !state.result && !inCheck,
  };
}

export interface GameStore extends Derived {
  screen: Screen;
  state: GameState;
  /** id of the selected piece (always belongs to the side to move) */
  selectedId: string | null;
  /** legal destinations for the selected piece */
  highlights: SquareRef[];
  /** latched for the P3 capture cinematic; null until the first capture */
  lastCapture: CaptureEvent | null;

  goTitle: () => void;
  startLocalGame: () => void;
  selectPiece: (id: string) => void;
  clickSquare: (sq: SquareRef) => void;
  pass: () => void;
  restart: () => void;
}

function freshGame() {
  const state = initialState();
  return {
    state,
    selectedId: null,
    highlights: [] as SquareRef[],
    lastCapture: null,
    ...derive(state),
  };
}

/** Commit an engine transition + refresh every derived slice. */
function commit(
  prev: GameStore,
  next: GameState,
): Partial<GameStore> {
  const index = next.history.length - 1;
  const applied = next.history[index];
  let lastCapture = prev.lastCapture;
  if (applied?.captured) {
    const at =
      applied.action.kind === "move"
        ? applied.action.move.to
        : { file: -1, rank: -1 };
    lastCapture = {
      seq: index,
      captured: applied.captured,
      captor: moverOf(index),
      captorPieceId: pieceAtSquare(next.board, at)?.id ?? null,
      at,
    };
  }
  return {
    state: next,
    selectedId: null,
    highlights: [],
    lastCapture,
    ...derive(next),
  };
}

/** Select `sq`'s piece if it belongs to the side to move; otherwise clear. */
function selectAt(state: GameState, sq: Square): Partial<GameStore> {
  const piece = pieceAtSquare(state.board, sq);
  if (!piece || piece.side !== state.turn || state.result) {
    return { selectedId: null, highlights: [] };
  }
  return { selectedId: piece.id, highlights: legalMovesFrom(state, sq) };
}

export const useGameStore = create<GameStore>((set, get) => ({
  screen: "title",
  ...freshGame(),

  goTitle: () => set({ screen: "title" }),

  startLocalGame: () => set({ screen: "game", ...freshGame() }),

  restart: () => set({ ...freshGame() }),

  selectPiece: (id) => {
    const store = get();
    const { state, selectedId } = store;
    if (state.result) return;

    const sq = squareOfPieceId(state.board, id);
    if (!sq) return;

    // Clicking an enemy piece that sits on a highlighted square is a capture:
    // PieceMesh stops propagation, so the board's pick plane never fires here.
    if (selectedId && store.highlights.some((h) => sameSquareRef(h, sq))) {
      store.clickSquare(sq);
      return;
    }

    // re-clicking the selection clears it
    if (id === selectedId) {
      set({ selectedId: null, highlights: [] });
      return;
    }

    set(selectAt(state, sq));
  },

  clickSquare: (sq) => {
    const { state, selectedId, highlights } = get();
    if (state.result) return;

    const isDestination = highlights.some((h) => sameSquareRef(h, sq));
    if (selectedId && isDestination) {
      const from = squareOfPieceId(state.board, selectedId);
      if (!from) {
        set({ selectedId: null, highlights: [] });
        return;
      }
      const action = { kind: "move", move: { from, to: sq } } as const;
      if (!isLegal(state, action)) {
        set({ selectedId: null, highlights: [] });
        return;
      }
      set(commit(get(), applyAction(state, action)));
      return;
    }

    // not a legal destination → treat as a (re)selection attempt
    set(selectAt(state, sq));
  },

  pass: () => {
    const { state } = get();
    const action = { kind: "pass" } as const;
    if (!isLegal(state, action)) return;
    set(commit(get(), applyAction(state, action)));
  },
}));
