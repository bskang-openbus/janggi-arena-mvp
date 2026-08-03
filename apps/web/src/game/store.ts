"use client";

/**
 * Local 2-player match store (P2).
 *
 * The engine is the single source of truth: every mutation goes through
 * `applyAction`, and all view data is derived from the returned `GameState`.
 * Derived values are materialised into the store (rather than computed in
 * selectors) so components can subscribe to stable references.
 */
import type {
  Action,
  Board,
  GameResult,
  GameState,
  Piece,
  Side,
  Square,
} from "engine";
import {
  applyAction,
  findGeneral,
  initialState,
  isCheck,
  isLegal,
  legalMovesFrom,
  opponent,
  stateFrom,
} from "engine";
import { create } from "zustand";
import type { AiLevel } from "@/src/ai/aiClient";
import { aiTiming, requestAiAction } from "@/src/ai/aiClient";
import type { PieceView, SquareRef } from "@/src/components/board/types";
import type { BloodDecal } from "@/src/components/board/vfx/BloodDecals";
import { variantIdFor } from "@/src/components/board/vfx/attackVariants";
import type { CinematicPlan } from "@/src/components/board/vfx/stage";
import type { VictoryPlan } from "@/src/components/board/vfx/victory";
import type { GameSnapshot, MatchResult } from "@/src/net/protocol";
import {
  boardToPieceViews,
  capturedBy,
  type CapturedGroup,
  describeAction,
  describeLastAction,
  groupCaptured,
  lastMoveOf,
  moverOf,
  pieceAtSquare,
  sameSquareRef,
  squareOfPieceId,
} from "./adapters";

export type Screen = "title" | "lobby" | "ai-setup" | "game";

/**
 * 로컬 2인 대국 / 서버 권위 온라인 대국 (P5) / 컴퓨터 대국 (P7).
 *
 * "ai"는 판정 주체가 로컬 엔진이라는 점에서 "local"과 같고 (온라인처럼 서버를
 * 기다리지 않는다), 한쪽 차례에 입력이 잠긴다는 점에서 "online"과 같다.
 */
export type Mode = "local" | "online" | "ai";

/** 컴퓨터 대국 설정 (P7). 재시작은 이 설정을 그대로 유지한다. */
export interface AiConfig {
  level: AiLevel;
  /** 사람이 맡은 진영 — 카메라 시점·입력 허용의 기준. AI는 그 반대편 */
  mySide: Side;
  /** 지정 시 AI가 완전히 재현 가능해진다 (E2E) */
  seed?: number;
}

/** AI 응답에 실려 온 탐색 지표 (표시·진단용). */
export interface AiInfo {
  score: number;
  depth: number;
  nodes: number;
  elapsedMs: number;
}

/**
 * 온라인 모드에서 보드 입력이 서버로 나가는 통로.
 *
 * `src/game/online.ts`가 대국 시작 시 주입한다. 이 스토어가 소켓 모듈을
 * 직접 import 하지 않는 이유는 순환 의존(online → store → online) 회피 +
 * 로컬 모드가 소켓 코드를 아예 로드하지 않게 하기 위해서다.
 */
export interface OnlineNet {
  move: (from: Square, to: Square) => void;
  pass: () => void;
}

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
  /** 지금까지 둔 수 (로컬 = history 길이, 온라인 = 서버 ply) */
  moveCount: number;
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
    moveCount: state.history.length,
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
  /** 외통 승리 연출 (P4) — non-null while it plays */
  victory: VictoryPlan | null;
  /** armed at 외통, released once any capture cinematic has finished */
  pendingVictory: VictoryPlan | null;
  settings: Settings;
  settingsOpen: boolean;

  /* ── P5 온라인 대국 ───────────────────────────────────────────── */
  /** "local"이면 아래 온라인 필드는 전부 비활성 (기본값) */
  mode: Mode;
  /** 온라인에서 내가 맡은 진영 — 카메라 시점과 입력 허용의 기준 */
  mySide: Side | null;
  /** 화면에 반영된 마지막 서버 스냅샷 */
  snapshot: GameSnapshot | null;
  /** 연출 재생 중에 도착해 아직 반영하지 못한 스냅샷 (도착 순서 유지) */
  pending: GameSnapshot[];
  /** 서버 판정 결과 (기권·시간초과·몰수 포함). 엔진 result보다 넓다 */
  matchResult: MatchResult | null;
  net: OnlineNet | null;

  /* ── P7 컴퓨터 대국 ───────────────────────────────────────────── */
  /** mode "ai"에서만 non-null. 재시작이 같은 설정을 쓰는 근거 */
  aiConfig: AiConfig | null;
  /** AI가 수를 고르고 있다 (최소 사고 시간 포함) — 그동안 입력 잠금 */
  aiThinking: boolean;
  /** 연출 재생 중에 도착해 아직 적용하지 못한 AI의 수 (online의 pending과 같은 역할) */
  aiPending: Action | null;
  /** 마지막 AI 응답의 탐색 지표 */
  aiInfo: AiInfo | null;

  goTitle: () => void;
  goLobby: () => void;
  /** 컴퓨터 대국 — 난이도·진영 선택 화면 */
  goAiSetup: () => void;
  startLocalGame: () => void;
  /** 선택한 난이도·진영으로 컴퓨터 대국 시작 (사람이 한이면 AI가 먼저 둔다) */
  startAiGame: (config: AiConfig) => void;
  /** 서버가 game:start를 보냈다 — 온라인 대국 화면으로 전환 */
  startOnlineMatch: (
    mySide: Side,
    snapshot: GameSnapshot,
    net: OnlineNet,
  ) => void;
  /** game:state / game:over 수신 — 연출 중이면 큐에 쌓고 끝난 뒤 반영한다 */
  applySnapshot: (snapshot: GameSnapshot) => void;
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
  /** 승리 연출이 3.2s를 다 재생했다 */
  endVictory: () => void;
  /** 화면 클릭 / "연출 스킵" — 결과 오버레이로 바로 넘어간다 */
  skipVictory: () => void;
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
    victory: null,
    pendingVictory: null,
    ...derive(state),
  };
}

/**
 * 온라인 세션 · 컴퓨터 대국 흔적을 지운다 — 로컬 대국은 항상 이 상태에서
 * 시작한다. mode "ai"는 이 기본값 위에 자기 필드를 덮어쓴다.
 */
function offlineDefaults() {
  return {
    mode: "local" as Mode,
    mySide: null,
    snapshot: null,
    pending: [] as GameSnapshot[],
    matchResult: null,
    net: null,
    aiConfig: null,
    aiThinking: false,
    aiPending: null as Action | null,
    aiInfo: null,
  };
}

/** 컴퓨터 대국 한 판의 시작 상태 (설정은 유지, 판은 초기화). */
function aiDefaults(config: AiConfig) {
  return {
    mode: "ai" as Mode,
    mySide: config.mySide,
    aiConfig: config,
    aiThinking: false,
    aiPending: null as Action | null,
    aiInfo: null,
    // 초가 선수이므로 사람이 한이면 첫 차례는 AI다 → 한수쉼도 잠긴다
    canPass: config.mySide === "cho",
  };
}

/**
 * 외통이면 승리 연출 계획을 만든다. 무승부(빅장·반복)는 대상이 아니다 —
 * docs/SCENES.md 3절이 규정하는 것은 "궁 — 외통 승리 연출"뿐이다.
 */
function victoryFor(state: GameState): VictoryPlan | null {
  const result = state.result;
  if (result?.type !== "checkmate") return null;
  const at = findGeneral(state.board, opponent(result.winner));
  return at ? { winner: result.winner, at } : null;
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
interface CaptureStaging {
  lastCapture: CaptureEvent;
  cinematic: CinematicPlan;
  pendingDecal: BloodDecal | null;
}

/**
 * Everything a capture arms, from data both the local engine path and the
 * online snapshot path can produce. `seq` must be strictly increasing and
 * never reused (local: history index, online: 서버 ply) — CaptureFX keys on it.
 */
function stageCapture(args: {
  seq: number;
  from: SquareRef;
  to: SquareRef;
  captured: Piece;
  /** board *after* the move — the captor already stands on `to` */
  boardAfter: Board;
  gore: boolean;
}): CaptureStaging | null {
  const { seq, from, to, captured, boardAfter, gore } = args;
  const captor = pieceAtSquare(boardAfter, to);
  if (!captor) return null;

  let pendingDecal: BloodDecal | null = null;
  if (gore) {
    // world-space direction of the blow (see `squareToWorld`: +X = file,
    // −Z = rank), so the splatter sprays away from the attacker
    const vx = to.file - from.file;
    const vz = -(to.rank - from.rank);
    const len = Math.hypot(vx, vz) || 1;
    pendingDecal = {
      id: `decal-${seq}`,
      file: to.file,
      rank: to.rank,
      dx: vx / len,
      dz: vz / len,
      seed: seq * 37 + to.file * 11 + to.rank * 7 + 3,
    };
  }

  return {
    lastCapture: {
      seq,
      captured,
      captor: captor.side,
      captorPieceId: captor.id,
      at: to,
    },
    cinematic: {
      seq,
      attacker: {
        id: captor.id,
        side: captor.side,
        type: captor.type,
        file: to.file,
        rank: to.rank,
      },
      victim: {
        id: `${captured.id}#ghost${seq}`,
        side: captured.side,
        type: captured.type,
        file: to.file,
        rank: to.rank,
      },
      from,
      to,
      variant: variantIdFor(captor.type),
    },
    pendingDecal,
  };
}

function commit(
  prev: GameStore,
  next: GameState,
): Partial<GameStore> {
  const index = next.history.length - 1;
  const applied = next.history[index];
  let staged: CaptureStaging | null = null;
  let lastCapture = prev.lastCapture;

  if (applied?.captured && applied.action.kind === "move") {
    const { from, to } = applied.action.move;
    staged = stageCapture({
      seq: index,
      from,
      to,
      captured: applied.captured,
      boardAfter: next.board,
      gore: prev.settings.gore,
    });
    // 포획 직후 도착점에 기물이 없는 국면은 존재하지 않지만, 그때도 전과
    // 목록만은 갱신되어야 한다
    lastCapture = staged?.lastCapture ?? {
      seq: index,
      captured: applied.captured,
      captor: moverOf(index),
      captorPieceId: null,
      at: to,
    };
  }

  const cinematic = staged?.cinematic ?? null;
  // The mating move is usually a capture, so the two cinematics queue rather
  // than fight: 포획 연출이 끝나야 승리 연출이 시작된다.
  const victoryPlan = victoryFor(next);

  const derived = derive(next);
  // 컴퓨터 대국: 내 차례가 아니면 한수쉼도 불가 (AI 차례에 판을 건드릴 수 없다)
  if (prev.mode === "ai" && prev.aiConfig) {
    derived.canPass = derived.canPass && next.turn === prev.aiConfig.mySide;
  }

  return {
    state: next,
    selectedId: null,
    highlights: [],
    lastCapture,
    cinematic,
    cinematicPhase: cinematic ? "cinematic" : "idle",
    pendingDecal: staged?.pendingDecal ?? null,
    victory: cinematic ? null : victoryPlan,
    pendingVictory: cinematic ? victoryPlan : null,
    ...derived,
  };
}

/* ------------------------------------------------------------------ */
/* 온라인 (P5) — 서버 스냅샷이 유일한 진실                              */
/* ------------------------------------------------------------------ */

/** 서버 결과 중 엔진이 이해하는 것만 골라낸다 (기권·시간초과는 서버 판정). */
function engineResultOf(result: MatchResult | null): GameResult | null {
  if (!result) return null;
  if (result.type === "checkmate") return { type: "checkmate", winner: result.winner };
  if (result.type === "draw") return { type: "draw", reason: result.reason };
  return null;
}

/**
 * 스냅샷 → 화면 상태.
 *
 * 로컬과 달리 engine history가 없으므로 잡힌 말 목록·마지막 수·장군 여부는
 * 전부 스냅샷에서 온다. `stateFrom`으로 만든 GameState는 *선택 가능한 수를
 * 미리 보여주기 위한 로컬 계산*에만 쓰이고, 실제 합법성 판정은 서버가 한다.
 */
function fromSnapshot(
  prev: GameStore,
  snap: GameSnapshot,
): Partial<GameStore> {
  const engineResult = engineResultOf(snap.result);
  const state: GameState = { ...stateFrom(snap.board, snap.turn), result: engineResult };

  const last = snap.lastAction;
  const advanced = !prev.snapshot || snap.ply > prev.snapshot.ply;
  let staged: CaptureStaging | null = null;
  if (
    advanced &&
    last &&
    last.kind === "move" &&
    last.captured &&
    last.from &&
    last.to
  ) {
    staged = stageCapture({
      seq: snap.ply,
      from: last.from,
      to: last.to,
      captured: last.captured,
      boardAfter: snap.board,
      gore: prev.settings.gore,
    });
  }

  const cinematic = staged?.cinematic ?? null;
  const victoryPlan = victoryFor(state);
  const myTurn = snap.status === "playing" && snap.turn === prev.mySide;

  return {
    state,
    snapshot: snap,
    matchResult: snap.result,
    selectedId: null,
    highlights: [],
    lastCapture: staged?.lastCapture ?? prev.lastCapture,
    cinematic,
    cinematicPhase: cinematic ? "cinematic" : "idle",
    pendingDecal: staged?.pendingDecal ?? null,
    victory: cinematic ? null : victoryPlan,
    pendingVictory: cinematic ? victoryPlan : null,

    pieces: boardToPieceViews(snap.board),
    lastMove:
      last && last.kind === "move" && last.from && last.to
        ? { from: last.from, to: last.to }
        : null,
    lastMoveLabel: last ? describeLastAction(last, snap.board) : null,
    checkSide: snap.check ? snap.turn : null,
    // snapshot.captured[side] = 그 진영이 *잃은* 기물 → 상대의 전과
    capturedByCho: groupCaptured(snap.captured.han),
    capturedByHan: groupCaptured(snap.captured.cho),
    canPass: myTurn && !snap.check && !snap.result,
    moveCount: snap.ply,
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

/**
 * 지금 이 클라이언트가 판을 건드릴 수 있는가?
 * 로컬은 언제나 예(한 화면에서 두 명이 번갈아 둔다), 온라인은 대국이
 * 진행 중이고 *내 차례* 일 때만, 컴퓨터 대국은 내 차례이고 AI가 생각하거나
 * 착수를 기다리고 있지 않을 때만.
 */
function canAct(store: GameStore): boolean {
  if (store.mode === "ai") {
    const config = store.aiConfig;
    return (
      !!config &&
      !store.state.result &&
      store.state.turn === config.mySide &&
      !store.aiThinking &&
      store.aiPending === null
    );
  }
  if (store.mode !== "online") return true;
  const snap = store.snapshot;
  return (
    !!snap &&
    snap.status === "playing" &&
    !snap.result &&
    snap.turn === store.mySide
  );
}

/** Select `sq`'s piece if it belongs to the side to move; otherwise clear. */
function selectAt(state: GameState, sq: Square): Partial<GameStore> {
  const piece = pieceAtSquare(state.board, sq);
  if (!piece || piece.side !== state.turn || state.result) {
    return { selectedId: null, highlights: [] };
  }
  return { selectedId: piece.id, highlights: legalMovesFrom(state, sq) };
}

export const useGameStore = create<GameStore>((set, get) => {
  /**
   * 연출이 끝난 직후 큐에 쌓인 서버 스냅샷 하나를 반영한다.
   *
   * 하나씩만 꺼내는 이유: 꺼낸 스냅샷이 또 포획이면 그 연출이 다시 시작되고,
   * 남은 스냅샷은 그 연출이 끝난 뒤에 이어서 반영되어야 하기 때문이다.
   */
  const drainPending = () => {
    const s = get();
    if (s.mode === "ai") {
      drainAi();
      return;
    }
    if (s.mode !== "online") return;
    if (s.cinematicPhase !== "idle" || s.victory) return;
    const [next, ...rest] = s.pending;
    if (!next) return;
    set({ ...fromSnapshot(s, next), pending: rest });
    // 반영한 스냅샷이 연출을 걸지 않았다면 그다음 것도 곧바로 이어서
    drainPending();
  };

  /* ── P7 컴퓨터 대국 진행 ───────────────────────────────────────── */

  /**
   * 진행 중인 사고·예약 착수를 무효화하는 세대 번호.
   *
   * AI 응답은 워커 왕복 + 최소 사고 시간 타이머를 지나 도착하므로, 그 사이
   * 재시작·타이틀 복귀·모드 전환이 일어날 수 있다. 응답을 받을 때 세대가
   * 바뀌었으면 조용히 버린다 (지난 판의 수가 새 판에 떨어지는 사고 방지).
   */
  let aiGeneration = 0;
  const cancelAi = () => {
    aiGeneration += 1;
  };

  /** AI의 수를 엔진에 적용한다 — 연출·사운드는 사람 수와 완전히 같은 경로. */
  const applyAiAction = (action: Action) => {
    const s = get();
    if (s.mode !== "ai" || s.state.result) return;
    // 방어: 계약상 항상 합법이지만, 아니면 한수쉼으로 대체해 판을 살린다
    const safe: Action = isLegal(s.state, action) ? action : { kind: "pass" };
    if (!isLegal(s.state, safe)) return;
    set(commit(s, applyAction(s.state, safe)));
  };

  /**
   * 사고가 끝났다. 연출(포획·승리)이 돌고 있으면 큐에 쌓아두고 끝난 뒤에
   * 적용한다 — online의 pending과 같은 규약이다. 연출 중에 판이 바뀌면
   * 결투 장면의 기물이 사라지거나 갑자기 순간이동한다.
   */
  const deliverAi = (action: Action) => {
    const s = get();
    if (s.cinematicPhase !== "idle" || s.victory) {
      set({ aiThinking: false, aiPending: action });
      return;
    }
    set({ aiThinking: false, aiPending: null });
    applyAiAction(action);
  };

  /** 연출이 끝난 직후 대기 중인 AI의 수를 흘려보낸다. */
  const drainAi = () => {
    const s = get();
    if (s.mode !== "ai" || !s.aiPending) return;
    if (s.cinematicPhase !== "idle" || s.victory) return;
    const action = s.aiPending;
    set({ aiPending: null });
    applyAiAction(action);
  };

  /**
   * AI 차례면 사고를 시작한다. 사람 수가 적용된 직후에 호출되므로 포획 연출과
   * 사고가 병행되고(연출 2.8초를 사고 시간으로 쓴다), 결과는 연출이 끝난 뒤에
   * 적용된다.
   */
  const aiTurn = () => {
    const s = get();
    const config = s.aiConfig;
    if (s.mode !== "ai" || !config) return;
    if (s.state.result) return;
    if (s.state.turn === config.mySide) return;
    if (s.aiThinking || s.aiPending) return;

    const generation = (aiGeneration += 1);
    const startedAt = Date.now();
    set({ aiThinking: true });

    void requestAiAction(s.state, { level: config.level, seed: config.seed })
      .then((result) => {
        if (generation !== aiGeneration) return;
        set({
          aiInfo: {
            score: result.score,
            depth: result.depth,
            nodes: result.nodes,
            elapsedMs: result.elapsedMs,
          },
        });
        // 즉답은 어색하다 — 총 사고 시간이 하한을 넘도록 남은 만큼 기다린다
        const rest = Math.max(0, aiTiming.minThinkMs - (Date.now() - startedAt));
        setTimeout(() => {
          if (generation !== aiGeneration) return;
          deliverAi(result.action);
        }, rest);
      })
      .catch(() => {
        if (generation !== aiGeneration) return;
        // AI를 얻지 못했다 (워커·폴백 모두 실패). 판을 멈추는 대신 한수쉼으로
        // 차례를 넘겨 사람이 계속 둘 수 있게 한다
        set({ aiThinking: false });
        const cur = get();
        if (cur.mode === "ai" && !cur.state.result) {
          deliverAi({ kind: "pass" });
        }
      });
  };

  return {
  screen: "title",
  settings: DEFAULT_SETTINGS,
  settingsOpen: false,
  ...offlineDefaults(),
  ...freshGame(),

  goTitle: () => {
    cancelAi();
    set({
      screen: "title",
      settingsOpen: false,
      ...offlineDefaults(),
      ...freshGame(),
    });
  },

  goLobby: () => {
    cancelAi();
    set({
      screen: "lobby",
      settingsOpen: false,
      ...offlineDefaults(),
      ...freshGame(),
    });
  },

  goAiSetup: () => {
    cancelAi();
    set({
      screen: "ai-setup",
      settingsOpen: false,
      ...offlineDefaults(),
      ...freshGame(),
    });
  },

  startLocalGame: () => {
    cancelAi();
    set({
      screen: "game",
      settingsOpen: false,
      ...offlineDefaults(),
      ...freshGame(),
    });
  },

  startAiGame: (config) => {
    cancelAi();
    set({
      screen: "game",
      settingsOpen: false,
      ...offlineDefaults(),
      ...freshGame(),
      ...aiDefaults(config),
    });
    // 사람이 한(후수)이면 초를 맡은 AI가 첫 수를 둔다
    aiTurn();
  },

  startOnlineMatch: (mySide, snapshot, net) => {
    set({
      screen: "game",
      settingsOpen: false,
      ...offlineDefaults(),
      ...freshGame(),
      mode: "online",
      mySide,
      net,
    });
    set(fromSnapshot(get(), snapshot));
  },

  applySnapshot: (snapshot) => {
    const s = get();
    if (s.mode !== "online") return;
    // 순서가 뒤집힌(또는 중복된) 스냅샷은 버린다 — ack와 브로드캐스트가
    // 같은 내용을 두 번 보내므로 흔한 경우다
    if (s.snapshot && snapshot.ply < s.snapshot.ply) return;
    if (s.snapshot && snapshot.ply === s.snapshot.ply && !snapshot.result) return;
    if (s.pending.length > 0) {
      const tail = s.pending[s.pending.length - 1];
      if (snapshot.ply < tail.ply) return;
      if (snapshot.ply === tail.ply && !snapshot.result) return;
    }
    // 연출 중에는 화면을 바꾸지 않는다 — 끝나면 도착 순서대로 반영한다
    if (s.cinematicPhase !== "idle" || s.victory) {
      set({ pending: [...s.pending, snapshot] });
      return;
    }
    set(fromSnapshot(s, snapshot));
  },

  restart: () => {
    const config = get().mode === "ai" ? get().aiConfig : null;
    cancelAi();
    if (config) {
      // 컴퓨터 대국 재시작 = 같은 난이도·같은 진영·같은 seed
      set({
        settingsOpen: false,
        ...offlineDefaults(),
        ...freshGame(),
        ...aiDefaults(config),
      });
      aiTurn();
      return;
    }
    set({ settingsOpen: false, ...offlineDefaults(), ...freshGame() });
  },

  endCinematic: () => {
    set((s) => ({
      ...flushDecal(s),
      cinematic: null,
      cinematicPhase: "idle" as CinematicPhase,
      victory: s.pendingVictory,
      pendingVictory: null,
    }));
    drainPending();
  },

  skipCinematic: () => {
    set((s) =>
      s.cinematicPhase === "idle"
        ? {}
        : {
            ...flushDecal(s),
            cinematic: null,
            cinematicPhase: "idle" as CinematicPhase,
            victory: s.pendingVictory,
            pendingVictory: null,
          },
    );
    drainPending();
  },

  endVictory: () => {
    set({ victory: null });
    drainPending();
  },

  skipVictory: () => {
    set({ victory: null });
    drainPending();
  },

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
    if (!canAct(store)) return;

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
    const store = get();
    const { state, selectedId, highlights, cinematicPhase, mode } = store;
    if (state.result || cinematicPhase !== "idle") return;
    if (!canAct(store)) return;

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
      if (mode === "online") {
        // 서버 권위: 판을 여기서 바꾸지 않는다. 의도만 보내고 game:state를 기다린다
        set({ selectedId: null, highlights: [] });
        store.net?.move(from, sq);
        return;
      }
      set(commit(get(), applyAction(state, action)));
      // 사람 수가 반영됐다 — AI 차례면 곧바로 사고를 시작한다 (포획 연출이
      // 돌고 있으면 결과는 연출이 끝난 뒤에 적용된다)
      if (mode === "ai") aiTurn();
      return;
    }

    // not a legal destination → treat as a (re)selection attempt
    set(selectAt(state, sq));
  },

  pass: () => {
    const store = get();
    const { state, cinematicPhase, mode } = store;
    if (cinematicPhase !== "idle") return;
    if (!canAct(store)) return;
    if (mode === "online") {
      if (!store.canPass) return;
      store.net?.pass();
      return;
    }
    const action = { kind: "pass" } as const;
    if (!isLegal(state, action)) return;
    set(commit(get(), applyAction(state, action)));
    if (mode === "ai") aiTurn();
  },
  };
});
