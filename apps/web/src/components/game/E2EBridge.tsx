"use client";

import type { Side } from "engine";
import { parseNotation, toNotation } from "engine";
import { useEffect } from "react";
import {
  AI_MIN_THINK_MS,
  aiTiming,
  aiWorkerActive,
  type AiLevel,
} from "@/src/ai/aiClient";
import { sfxCounts, sfxState } from "@/src/audio/engine";
import {
  cinematicClock,
  rawForStageTime,
  resetCinematicClock,
  stage,
} from "@/src/components/board/vfx/stage";
import { victoryStage } from "@/src/components/board/vfx/victory";
import { pieceAtSquare } from "@/src/game/adapters";
import { useGameStore } from "@/src/game/store";
import { chibiStats, cutinRuntime } from "./cutin";

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
  /**
   * 컴퓨터 대국 시작 (P7) — 선택 화면의 "대국 시작" 버튼과 같은 스토어 액션.
   * `seed`를 넣으면 AI가 완전히 재현되므로 기보가 결정적으로 고정된다.
   */
  startAi: (config: { level: AiLevel; mySide: Side; seed?: number }) => void;
  /**
   * AI 최소 사고 시간(하한)을 바꾼다. 기본 800ms는 "생각 중" 표시를 DOM에서
   * 관찰하기엔 짧을 수 있어, 그 표시를 검사하는 테스트만 늘려 쓴다.
   * 인수를 생략하면 기본값으로 되돌린다.
   */
  setAiThinkFloor: (ms?: number) => void;
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
    /** "local" | "online" */
    mode: string;
    /** 온라인 세션 상태 — 로컬 대국에서는 null */
    online: {
      mySide: string | null;
      /** 화면에 반영된 서버 ply */
      ply: number;
      status: string;
      /** 아직 반영하지 못한(연출 대기) 스냅샷 수 */
      pending: number;
      myTurn: boolean;
      /** 서버 판정 결과 타입 (기권·시간초과 포함) */
      result: string | null;
      autoPass: { cho: number; han: number } | null;
    } | null;
    /** 컴퓨터 대국 상태 (P7) — 다른 모드에서는 null */
    ai: {
      level: number;
      /** AI가 수를 고르고 있다 (최소 사고 시간 포함) */
      thinking: boolean;
      /** 사람이 맡은 진영 */
      mySide: string;
      /** 연출이 끝나기를 기다리는 AI의 수가 있다 */
      pending: boolean;
      seed: number | null;
      /** 마지막 응답의 탐색 깊이 / 노드 수 (스텁이면 가짜 값) */
      depth: number | null;
      nodes: number | null;
      /** 탐색이 Web Worker에서 돌고 있는가 (false = 메인 스레드 폴백) */
      worker: boolean;
    } | null;
    /** 사운드 ON/OFF (설정 오버레이) */
    sound: boolean;
    /** P6: SFX id별 재생 호출 횟수 + `total`. 소리 자체는 검증할 수 없으므로
     *  타임라인 훅이 제때 트리거되는지를 이 카운터로 확인한다 */
    sfx: Record<string, number>;
    /** AudioContext 상태 ("none" | "suspended" | "running") */
    sfxState: string;
    /** P8 치비 컷인 상태 */
    cutin: {
      /** 설정 토글 (기본 ON) */
      enabled: boolean;
      /** "capture" | "victory" | null — 지금 붙어 있는 컷인 */
      kind: string | null;
      /** 실제로 화면에 보이는 중인가 (불투명도 > 0.02) */
      visible: boolean;
      /** DOM에 붙어 있고 디코딩까지 끝난 이미지 수 (naturalWidth > 0) */
      loaded: number;
      /** 붙어 있는 img 수 (로딩 실패로 생략된 것은 제외) */
      mounted: number;
      attacker: string | null;
      victim: string | null;
      /** 프리로드 성공/실패 집계 (총 14장) */
      preloaded: number;
      failed: number;
    };
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
      startAi: (config) => {
        useGameStore.getState().startAiGame(config);
      },
      setAiThinkFloor: (ms) => {
        aiTiming.minThinkMs = ms ?? AI_MIN_THINK_MS;
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
          mode: s.mode,
          online:
            s.mode === "online"
              ? {
                  mySide: s.mySide,
                  ply: s.snapshot?.ply ?? 0,
                  status: s.snapshot?.status ?? "waiting",
                  pending: s.pending.length,
                  myTurn:
                    !!s.snapshot &&
                    s.snapshot.status === "playing" &&
                    s.snapshot.turn === s.mySide,
                  result: s.matchResult?.type ?? null,
                  autoPass: s.snapshot?.autoPassCount ?? null,
                }
              : null,
          ai:
            s.mode === "ai" && s.aiConfig
              ? {
                  level: s.aiConfig.level,
                  thinking: s.aiThinking,
                  mySide: s.aiConfig.mySide,
                  pending: s.aiPending !== null,
                  seed: s.aiConfig.seed ?? null,
                  depth: s.aiInfo?.depth ?? null,
                  nodes: s.aiInfo?.nodes ?? null,
                  worker: aiWorkerActive(),
                }
              : null,
          sound: s.settings.sound,
          sfx: { ...sfxCounts },
          sfxState: sfxState(),
          cutin: {
            enabled: s.settings.cutin,
            kind: cutinRuntime.kind,
            visible: cutinRuntime.visible,
            loaded: cutinRuntime.loaded,
            mounted: cutinRuntime.mounted,
            attacker: cutinRuntime.attacker,
            victim: cutinRuntime.victim,
            preloaded: chibiStats.ready,
            failed: chibiStats.failed,
          },
        };
      },
    };

    window.__janggi = api;
    return () => {
      resetCinematicClock();
      aiTiming.minThinkMs = AI_MIN_THINK_MS;
      delete window.__janggi;
    };
  }, []);

  return null;
}

export default E2EBridge;
