/**
 * AI 탐색 워커 (P7) — docs/AI_API.md "웹 소비 규약".
 *
 * UI 스레드에서 탐색을 돌리면 고급 난이도의 1초대 탐색이 프레임을 통째로
 * 잡아먹는다. 그래서 탐색은 이 워커에서만 돌고, **engine AI 의존은 이 파일
 * 한 곳에만 존재한다.**
 *
 * 메인 스레드 폴백(`aiClient.ts`)이 이 모듈을 동적 import 해서 `choose`를
 * 재사용한다. 그래서 message 리스너는 진짜 워커 컨텍스트에서만 설치한다 —
 * 그러지 않으면 window에 message 핸들러가 붙어 외부 postMessage에 반응한다.
 */
import type {
  AiRequestMessage,
  AiResponseMessage,
  ChooseAiAction,
} from "./types";

/* ─── AI 구현 스위치: 아래 import 한 줄이 스텁 ↔ 실제 엔진 전환점이다 ──── */
// TODO(orchestrator): engine AI 머지 후 이 줄 교체
import { chooseAiAction } from "./stub";
// 머지 후 →  import { chooseAiAction } from "engine";
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * 워커를 띄우지 못한 환경(구형 브라우저 · 워커 청크 로드 실패)에서 메인
 * 스레드 폴백이 그대로 호출한다. 위 스위치 한 줄이 폴백까지 함께 바꾼다.
 */
export const choose: ChooseAiAction = chooseAiAction;

/** 요청 하나를 응답 하나로. 예외는 응답으로 감싸 클라이언트가 폴백할 수 있게 한다. */
export function solve(request: AiRequestMessage): AiResponseMessage {
  try {
    return { id: request.id, ok: true, result: choose(request.state, request.opts) };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * DedicatedWorkerGlobalScope를 lib 참조 없이 다룬다 (`/// <reference lib="webworker" />`
 * 는 Next의 DOM lib과 `self` 선언이 충돌한다).
 */
const scope = globalThis as unknown as {
  importScripts?: unknown;
  addEventListener: (
    type: "message",
    listener: (event: { data: AiRequestMessage }) => void,
  ) => void;
  postMessage: (message: AiResponseMessage) => void;
};

if (typeof scope.importScripts === "function") {
  scope.addEventListener("message", (event) => {
    scope.postMessage(solve(event.data));
  });
}
