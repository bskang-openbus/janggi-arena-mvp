"use client";

import { parseNotation, toNotation } from "engine";
import { useEffect } from "react";
import { pieceAtSquare } from "@/src/game/adapters";
import { useGameStore } from "@/src/game/store";

/**
 * TEST-ONLY input bridge.
 *
 * Clicking a 3D intersection from Playwright would mean re-deriving the
 * camera projection in the test; instead this exposes the *same* store actions
 * the pointer handlers call, so the game logic under test is identical to
 * production. It is mounted only outside production builds (or when
 * NEXT_PUBLIC_E2E=1) and contains no game logic of its own.
 */
const ENABLED =
  process.env.NEXT_PUBLIC_E2E === "1" || process.env.NODE_ENV !== "production";

export interface JanggiTestApi {
  /** click the intersection (as the board pick plane does) */
  clickSquare: (notation: string) => void;
  /** click the piece standing there (as PieceMesh does); no-op if empty */
  clickPiece: (notation: string) => void;
  /** full UI gesture: select the mover, then click the destination */
  play: (from: string, to: string) => void;
  /** replay a fixture's move list through the UI gesture path */
  playAll: (moves: { from: string; to: string }[]) => void;
  /** 한수쉼 — same action the pass button dispatches */
  pass: () => void;
  snapshot: () => {
    turn: string;
    result: string | null;
    moves: number;
    selected: string | null;
    highlights: string[];
    lastCapture: { seq: number; type: string; side: string } | null;
  };
}

declare global {
  interface Window {
    __janggi?: JanggiTestApi;
  }
}

export function E2EBridge() {
  useEffect(() => {
    if (!ENABLED || typeof window === "undefined") return;

    const clickPiece = (notation: string) => {
      const store = useGameStore.getState();
      const sq = parseNotation(notation);
      const piece = pieceAtSquare(store.state.board, sq);
      if (!piece) return;
      store.selectPiece(piece.id);
    };

    const clickSquare = (notation: string) => {
      useGameStore.getState().clickSquare(parseNotation(notation));
    };

    const api: JanggiTestApi = {
      clickSquare,
      clickPiece,
      play: (from, to) => {
        clickPiece(from);
        // the real board routes a click on an occupied square to the piece
        // (PieceMesh stops propagation), so mirror that here
        const board = useGameStore.getState().state.board;
        if (pieceAtSquare(board, parseNotation(to))) {
          clickPiece(to);
        } else {
          clickSquare(to);
        }
      },
      playAll: (moves) => {
        for (const m of moves) api.play(m.from, m.to);
      },
      pass: () => {
        useGameStore.getState().pass();
      },
      snapshot: () => {
        const s = useGameStore.getState();
        return {
          turn: s.state.turn,
          result: s.state.result ? s.state.result.type : null,
          moves: s.state.history.length,
          selected: s.selectedId,
          highlights: s.highlights.map(toNotation),
          lastCapture: s.lastCapture
            ? {
                seq: s.lastCapture.seq,
                type: s.lastCapture.captured.type,
                side: s.lastCapture.captured.side,
              }
            : null,
        };
      },
    };

    window.__janggi = api;
    return () => {
      delete window.__janggi;
    };
  }, []);

  return null;
}

export default E2EBridge;
