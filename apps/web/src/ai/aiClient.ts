"use client";

/**
 * AI 클라이언트 (P7) — **웹에서 AI를 참조하는 유일한 공개 창구.**
 *
 * 스토어·UI·E2E 브리지는 이 파일만 import 한다. 그 아래로 무엇이 있는지
 * (워커냐 메인 스레드냐, engine AI냐 임시 스텁이냐)는 전부 여기서 감춘다.
 *
 *   store/UI ─▶ aiClient ─▶ Web Worker(ai.worker.ts) ─▶ chooseAiAction
 *                        └▶ (워커 실패) 동일 모듈 동적 import ─▶ 같은 함수
 *
 * 폴백을 "같은 모듈 동적 import"로 만든 이유: 구현 전환점을 워커 파일의
 * import 한 줄로 묶어두기 위해서다. 폴백이 스텁을 따로 import 하면 전환점이
 * 두 곳으로 갈라진다.
 */
import type { GameState } from "engine";
import type {
  AiLevel,
  AiOptions,
  AiRequestMessage,
  AiResponseMessage,
  AiResult,
  ChooseAiAction,
} from "./types";

export type { AiLevel, AiOptions, AiResult } from "./types";

/* ------------------------------------------------------------------ */
/* 난이도 (UI 표기 + 시간 예산)                                          */
/* ------------------------------------------------------------------ */

export interface AiLevelInfo {
  level: AiLevel;
  label: string;
  /** 선택 화면의 설명 한 줄 */
  hint: string;
  /** docs/AI_API.md 난이도 설계 방향 — engine AI에 그대로 전달된다 */
  timeBudgetMs: number;
}

export const AI_LEVELS: readonly AiLevelInfo[] = [
  {
    level: 1,
    label: "초급",
    hint: "얕게 보고 가끔 실수합니다. 장기를 처음 배우는 상대.",
    timeBudgetMs: 200,
  },
  {
    level: 2,
    label: "중급",
    hint: "물량과 자리를 따집니다. 평범한 유저와 접전.",
    timeBudgetMs: 600,
  },
  {
    level: 3,
    label: "고급",
    hint: "깊이 읽고 포획 수순을 끝까지 확인합니다. 만만치 않습니다.",
    timeBudgetMs: 1200,
  },
];

export function aiLevelInfo(level: AiLevel): AiLevelInfo {
  return AI_LEVELS.find((entry) => entry.level === level) ?? AI_LEVELS[0];
}

/* ------------------------------------------------------------------ */
/* 사고 시간 하한                                                       */
/* ------------------------------------------------------------------ */

/**
 * 사람이 둔 직후 AI가 0ms에 응수하면 "생각한다"는 느낌이 사라진다. 탐색이
 * 아무리 빨리 끝나도 이만큼은 흐른 뒤에 착수한다 (스토어가 적용한다).
 */
export const AI_MIN_THINK_MS = 800;

/** 하한은 E2E가 "생각 중" 표시를 결정적으로 관찰할 수 있도록 조절 가능하다. */
export const aiTiming = { minThinkMs: AI_MIN_THINK_MS };

/** 워커가 먹통이 되면 이 시간 뒤 폴백으로 넘어간다. */
const WORKER_TIMEOUT_MS = 8000;

/* ------------------------------------------------------------------ */
/* 워커                                                                */
/* ------------------------------------------------------------------ */

interface Waiter {
  resolve: (result: AiResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
/** 한 번 실패한 워커는 다시 시도하지 않는다 — 매 수마다 실패를 반복할 이유가 없다 */
let workerUnavailable = false;
let nextId = 0;
const waiting = new Map<number, Waiter>();

function rejectAll(reason: string): void {
  for (const waiter of waiting.values()) {
    clearTimeout(waiter.timer);
    waiter.reject(new Error(reason));
  }
  waiting.clear();
}

function dropWorker(reason: string): void {
  workerUnavailable = true;
  const dying = worker;
  worker = null;
  rejectAll(reason);
  dying?.terminate();
}

function ensureWorker(): Worker | null {
  if (workerUnavailable) return null;
  if (worker) return worker;
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    workerUnavailable = true;
    return null;
  }
  try {
    // 리터럴 형태를 유지해야 webpack이 별도 청크로 뽑아낸다
    const spawned = new Worker(new URL("./ai.worker.ts", import.meta.url), {
      type: "module",
    });
    spawned.onmessage = (event: MessageEvent<AiResponseMessage>) => {
      const message = event.data;
      const waiter = waiting.get(message.id);
      if (!waiter) return;
      waiting.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.ok) waiter.resolve(message.result);
      else waiter.reject(new Error(message.error));
    };
    spawned.onerror = () => {
      dropWorker("AI 워커 실행 실패");
    };
    spawned.onmessageerror = () => {
      dropWorker("AI 워커 메시지 복제 실패");
    };
    worker = spawned;
    return spawned;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

function askWorker(
  target: Worker,
  state: GameState,
  opts: AiOptions,
): Promise<AiResult> {
  const id = (nextId += 1);
  return new Promise<AiResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error("AI 워커 응답 시간 초과"));
    }, WORKER_TIMEOUT_MS);
    waiting.set(id, { resolve, reject, timer });
    const request: AiRequestMessage = { id, state, opts };
    try {
      target.postMessage(request);
    } catch (error) {
      waiting.delete(id);
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/* ------------------------------------------------------------------ */
/* 메인 스레드 폴백                                                     */
/* ------------------------------------------------------------------ */

let mainThreadChoose: ChooseAiAction | null = null;

async function loadFallback(): Promise<ChooseAiAction> {
  if (!mainThreadChoose) {
    // 워커와 **같은 모듈** — 구현 스위치가 한 곳으로 유지된다
    const workerModule = await import("./ai.worker");
    mainThreadChoose = workerModule.choose;
  }
  return mainThreadChoose;
}

/* ------------------------------------------------------------------ */
/* 공개 API                                                            */
/* ------------------------------------------------------------------ */

/**
 * 지금 국면에서 AI가 둘 수를 구한다.
 *
 * 워커가 있으면 워커에서, 없거나 실패하면 메인 스레드에서 같은 함수를 돌린다.
 * 어느 경로든 반환 형태는 docs/AI_API.md의 `AiResult` 하나다.
 */
export async function requestAiAction(
  state: GameState,
  opts: AiOptions,
): Promise<AiResult> {
  const budget = opts.timeBudgetMs ?? aiLevelInfo(opts.level).timeBudgetMs;
  const request: AiOptions = { ...opts, timeBudgetMs: budget };

  const target = ensureWorker();
  if (target) {
    try {
      return await askWorker(target, state, request);
    } catch {
      // 워커 경로가 죽었다 — 판을 멈추지 않고 메인 스레드로 내려간다
      dropWorker("AI 워커를 사용할 수 없습니다");
    }
  }
  const choose = await loadFallback();
  return choose(state, request);
}

/** 워커가 실제로 살아 있는지 (진단·E2E 표시용). */
export function aiWorkerActive(): boolean {
  return worker !== null;
}
