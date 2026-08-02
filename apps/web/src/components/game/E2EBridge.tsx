"use client";

import { parseNotation, toNotation } from "engine";
import { useEffect } from "react";
import {
  cinematicClock,
  rawForStageTime,
  resetCinematicClock,
  stage,
} from "@/src/components/board/vfx/stage";
import { victoryStage } from "@/src/components/board/vfx/victory";
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
  /** 재시작 — same action the restart button dispatches */
  restart: () => void;
  /** 연출 스킵 — same action a tap on the cinematic overlay dispatches */
  skipCinematic: () => void;
  /**
   * Hand the cinematic clock to the test. Call *before* the capturing move:
   * the timeline then stays at t=0 until `seekCinematic` moves it, which
   * removes the race between a Playwright round-trip and the 2.9s timeline.
   */
  pauseCinematic: () => void;
  /** Give the clock back to real time (the timeline resumes from where it is). */
  resumeCinematic: () => void;
  /** Jump the timeline to cinematic second `t` (hitstop-adjusted). */
  seekCinematic: (t: number) => void;
  /** 승리 연출 스킵 — same action a tap on the victory overlay dispatches */
  skipVictory: () => void;
  snapshot: () => {
    turn: string;
    result: string | null;
    moves: number;
    selected: string | null;
    highlights: string[];
    lastCapture: { seq: number; type: string; side: string } | null;
    /** "idle" | "cinematic" */
    cinematic: string;
    /** cinematic seconds elapsed (hitstop-frozen), 0 when idle */
    cinematicT: number;
    /** id of the Tier 2 attack variant in play, or null */
    variant: string | null;
    /** piece type that made the capture, or null */
    captorType: string | null;
    /** winner side while the 외통 연출 plays, else null */
    victory: string | null;
    victoryT: number;
    decals: number;
    gore: boolean;
  };
  /**
   * Reads the WebGL framebuffer back through a 2D canvas so a test can prove
   * a frame is not blank. Needs `preserveDrawingBuffer`, which JanggiScene
   * only enables outside production builds.
   */
  sampleFrame: () => { mean: number; hot: number; colored: number } | null;
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
      restart: () => {
        useGameStore.getState().restart();
      },
      skipCinematic: () => {
        useGameStore.getState().skipCinematic();
      },
      pauseCinematic: () => {
        cinematicClock.manual = true;
      },
      resumeCinematic: () => {
        cinematicClock.manual = false;
        cinematicClock.seek = null;
      },
      seekCinematic: (t) => {
        cinematicClock.seek = rawForStageTime(t);
      },
      skipVictory: () => {
        useGameStore.getState().skipVictory();
      },
      sampleFrame: () => {
        const canvas = document.querySelector("canvas");
        if (!canvas) return null;
        const w = 192;
        const h = 120;
        const off = document.createElement("canvas");
        off.width = w;
        off.height = h;
        const ctx = off.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(canvas, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        let sum = 0;
        let hot = 0;
        let colored = 0;
        const n = w * h;
        for (let i = 0; i < n; i += 1) {
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          sum += lum;
          if (lum > 150) hot += 1;
          if (Math.max(r, g, b) - Math.min(r, g, b) > 45) colored += 1;
        }
        return { mean: sum / n, hot: hot / n, colored: colored / n };
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
          cinematic: s.cinematicPhase,
          cinematicT: stage.active ? stage.t : 0,
          /** which Tier 2 attack the last capture used */
          variant: s.cinematic?.variant ?? null,
          captorType: s.cinematic?.attacker.type ?? null,
          victory: s.victory ? s.victory.winner : null,
          victoryT: victoryStage.active ? victoryStage.t : 0,
          decals: s.decals.length,
          gore: s.settings.gore,
        };
      },
    };

    window.__janggi = api;
    return () => {
      resetCinematicClock();
      delete window.__janggi;
    };
  }, []);

  return null;
}

export default E2EBridge;
