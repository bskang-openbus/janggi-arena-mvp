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
import type { BloodDecal } from "@/src/components/board/vfx/BloodDecals";
import { variantIdFor } from "@/src/components/board/vfx/attackVariants";
import type { CinematicPlan } from "@/src/components/board/vfx/stage";
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

/** 연출 상태머신 (docs/SCENES.md 2절). idle 이외에는 보드 입력이 잠긴다. */
export type CinematicPhase = "idle" | "cinematic";

/** 설정 오버레이 (docs/PRD.md 4절). zustand persist 대신 세션 + localStorage. */
export interface Settings {
  /** 혈흔 표현 — OFF면 붉은 파티클이 백금색 스파크로 대체되고 데칼이 없다 */
  gore: boolean;
  /** 사운드 — P6 자리 확보 */
  sound: boolean;
  /** 저사양 모드 — 후처리 OFF + 파티클 감소 */
  lowSpec: boolean;
}

const SETTINGS_KEY = "janggi.settings.v1";

const DEFAULT_SETTINGS: Settings = { gore: true, sound: true, lowSpec: false };

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      gore: parsed.gore ?? DEFAULT_SETTINGS.gore,
      sound: parsed.sound ?? DEFAULT_SETTINGS.sound,
      lowSpec: parsed.lowSpec ?? DEFAULT_SETTINGS.lowSpec,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: Settings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* private mode — settings simply don't persist */
  }
}

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

  /* ── P3 포획 연출 ─────────────────────────────────────────────── */
  /** idle 이외에는 모든 보드 입력이 잠긴다 */
  cinematicPhase: CinematicPhase;
  /** the running cinematic, or null when idle */
  cinematic: CinematicPlan | null;
  /** 바닥에 남은 혈흔 자국 (혈흔 OFF면 비어 있음) */
  decals: BloodDecal[];
  /** decal waiting for the 1.5s dissolve beat */
  pendingDecal: BloodDecal | null;
  settings: Settings;
  settingsOpen: boolean;

  goTitle: () => void;
  startLocalGame: () => void;
  selectPiece: (id: string) => void;
  clickSquare: (sq: SquareRef) => void;
  pass: () => void;
  restart: () => void;

  /** timeline reached 2.8s */
  endCinematic: () => void;
  /** 화면 클릭 / "연출 스킵" — 즉시 최종 상태로 점프 */
  skipCinematic: () => void;
  /** 1.5s 디졸브 시점: 혈흔 데칼을 영구 목록으로 옮긴다 */
  commitDecal: () => void;
  openSettings: (open: boolean) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  /** read localStorage once on the client (SSR renders the defaults) */
  hydrateSettings: () => void;
}

function freshGame() {
  const state = initialState();
  return {
    state,
    selectedId: null,
    highlights: [] as SquareRef[],
    lastCapture: null,
    cinematicPhase: "idle" as CinematicPhase,
    cinematic: null,
    decals: [] as BloodDecal[],
    pendingDecal: null,
    ...derive(state),
  };
}

/** Newest first; the board keeps at most this many battle marks. */
const MAX_DECALS = 10;

/**
 * Commit an engine transition + refresh every derived slice.
 *
 * A capture also arms the P3 cinematic: the plan carries the *pre-move* square
 * of the attacker and a copy of the victim (already gone from the board) so the
 * scene can stage the duel and dissolve the ghost.
 */
function commit(
  prev: GameStore,
  next: GameState,
): Partial<GameStore> {
  const index = next.history.length - 1;
  const applied = next.history[index];
  let lastCapture = prev.lastCapture;
  let cinematic: CinematicPlan | null = null;
  let pendingDecal: BloodDecal | null = null;

  if (applied?.captured && applied.action.kind === "move") {
    const { from, to } = applied.action.move;
    const captor = pieceAtSquare(next.board, to);
    lastCapture = {
      seq: index,
      captured: applied.captured,
      captor: moverOf(index),
      captorPieceId: captor?.id ?? null,
      at: to,
    };
    if (captor) {
      cinematic = {
        seq: index,
        attacker: {
          id: captor.id,
          side: captor.side,
          type: captor.type,
          file: to.file,
          rank: to.rank,
        },
        victim: {
          id: `${applied.captured.id}#ghost${index}`,
          side: applied.captured.side,
          type: applied.captured.type,
          file: to.file,
          rank: to.rank,
        },
        from,
        to,
        variant: variantIdFor(captor.type),
      };
      if (prev.settings.gore) {
        // world-space direction of the blow (see `squareToWorld`: +X = file,
        // −Z = rank), so the splatter sprays away from the attacker
        const vx = to.file - from.file;
        const vz = -(to.rank - from.rank);
        const len = Math.hypot(vx, vz) || 1;
        pendingDecal = {
          id: `decal-${index}`,
          file: to.file,
          rank: to.rank,
          dx: vx / len,
          dz: vz / len,
          seed: index * 37 + to.file * 11 + to.rank * 7 + 3,
        };
      }
    }
  }

  return {
    state: next,
    selectedId: null,
    highlights: [],
    lastCapture,
    cinematic,
    cinematicPhase: cinematic ? "cinematic" : "idle",
    pendingDecal,
    ...derive(next),
  };
}

/** Move the armed decal onto the persistent list (idempotent). */
function flushDecal(store: GameStore): Partial<GameStore> {
  if (!store.pendingDecal) return {};
  const decals = [...store.decals, store.pendingDecal];
  return {
    decals: decals.length > MAX_DECALS ? decals.slice(-MAX_DECALS) : decals,
    pendingDecal: null,
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
  settings: DEFAULT_SETTINGS,
  settingsOpen: false,
  ...freshGame(),

  goTitle: () => set({ screen: "title", settingsOpen: false, ...freshGame() }),

  startLocalGame: () =>
    set({ screen: "game", settingsOpen: false, ...freshGame() }),

  restart: () => set({ settingsOpen: false, ...freshGame() }),

  endCinematic: () =>
    set((s) => ({
      ...flushDecal(s),
      cinematic: null,
      cinematicPhase: "idle" as CinematicPhase,
    })),

  skipCinematic: () =>
    set((s) =>
      s.cinematicPhase === "idle"
        ? {}
        : {
            ...flushDecal(s),
            cinematic: null,
            cinematicPhase: "idle" as CinematicPhase,
          },
    ),

  commitDecal: () => set((s) => flushDecal(s)),

  openSettings: (open) => set({ settingsOpen: open }),

  hydrateSettings: () => set({ settings: loadSettings() }),

  updateSettings: (patch) =>
    set((s) => {
      const settings = { ...s.settings, ...patch };
      saveSettings(settings);
      return { settings };
    }),

  selectPiece: (id) => {
    const store = get();
    const { state, selectedId } = store;
    if (state.result || store.cinematicPhase !== "idle") return;

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
    const { state, selectedId, highlights, cinematicPhase } = get();
    if (state.result || cinematicPhase !== "idle") return;

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
    const { state, cinematicPhase } = get();
    if (cinematicPhase !== "idle") return;
    const action = { kind: "pass" } as const;
    if (!isLegal(state, action)) return;
    set(commit(get(), applyAction(state, action)));
  },
}));
