"use client";

/**
 * socket.io transport for the online match (P5).
 *
 * Deliberately dumb: it owns exactly one socket, wires the five server
 * broadcasts to callbacks supplied by `src/game/online.ts`, and turns the ack
 * protocol into promises. No game state, no React, no store imports — which is
 * what keeps `src/game/store.ts` free of a circular dependency (the store only
 * ever calls the emit helpers below).
 *
 * 로컬 대국은 이 모듈을 절대 로드하지 않는다: 소켓은 온라인 진입 시에만
 * 만들어지므로 서버가 꺼져 있어도 로컬 모드는 그대로 동작한다
 * (CLAUDE.md 절대 규칙 7).
 */
import type { Square } from "engine";
import { io, type Socket } from "socket.io-client";
import {
  type Ack,
  type ActionAck,
  CLIENT_EVENT,
  type GameOverEvent,
  type GameStartEvent,
  type GameStateEvent,
  type OpponentDisconnectedEvent,
  type RoomUpdateEvent,
  SERVER_EVENT,
  type SeatedAck,
} from "./protocol";

const DEFAULT_SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

/**
 * 접속할 서버 주소.
 *
 * `?server=` 쿼리로 덮어쓸 수 있다 — 빌드 시점에 박히는 env와 달리 실행 중에
 * 바꿀 수 있어야 "서버가 꺼져 있어도 로컬 대국은 동작한다"(CLAUDE.md 절대
 * 규칙 7)를 E2E로 증명할 수 있고, 배포된 페이지로 다른 서버를 붙여보는 데도
 * 쓸 수 있다.
 */
export function serverUrl(): string {
  if (typeof window !== "undefined") {
    const override = new URLSearchParams(window.location.search).get("server");
    if (override) return override;
  }
  return DEFAULT_SERVER_URL;
}

/** How long an ack may take before we give up on it. */
const ACK_TIMEOUT_MS = 10_000;
/** How long the initial handshake may take before we bail back to 타이틀. */
const CONNECT_TIMEOUT_MS = 8_000;

export interface ServerHandlers {
  onRoomUpdate: (event: RoomUpdateEvent) => void;
  onGameStart: (event: GameStartEvent) => void;
  onGameState: (event: GameStateEvent) => void;
  onGameOver: (event: GameOverEvent) => void;
  onOpponentDisconnected: (event: OpponentDisconnectedEvent) => void;
  /** our own socket dropped (server restart / network) */
  onDisconnect: (reason: string) => void;
}

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

/**
 * Open the connection (idempotent while connected).
 *
 * `reconnection: false` is intentional: PRD 3절 excludes 재접속 복구 and the
 * server keys a seat by socket id, so a silent reconnect would come back as a
 * *different* player and be rejected with ROOM_FULL. A dropped socket is a
 * dropped match — we say so instead of pretending otherwise.
 */
export function connect(handlers: ServerHandlers): Promise<Socket> {
  if (socket?.connected) return Promise.resolve(socket);
  disconnect();

  const next = io(serverUrl(), {
    transports: ["websocket"],
    reconnection: false,
    timeout: CONNECT_TIMEOUT_MS,
    forceNew: true,
  });
  socket = next;

  next.on(SERVER_EVENT.roomUpdate, handlers.onRoomUpdate);
  next.on(SERVER_EVENT.gameStart, handlers.onGameStart);
  next.on(SERVER_EVENT.gameState, handlers.onGameState);
  next.on(SERVER_EVENT.gameOver, handlers.onGameOver);
  next.on(SERVER_EVENT.opponentDisconnected, handlers.onOpponentDisconnected);
  next.on("disconnect", (reason: string) => {
    if (socket === next) handlers.onDisconnect(reason);
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      next.close();
      if (socket === next) socket = null;
      reject(new Error("connect timeout"));
    }, CONNECT_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      next.off("connect", onConnect);
      next.off("connect_error", onError);
    }
    function onConnect() {
      cleanup();
      resolve(next);
    }
    function onError(error: Error) {
      cleanup();
      next.close();
      if (socket === next) socket = null;
      reject(error);
    }

    next.once("connect", onConnect);
    next.once("connect_error", onError);
  });
}

export function disconnect(): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.close();
  socket = null;
}

/** socket.io ack → promise. Rejects only on transport failure, never on `ok:false`. */
function emitAck<T extends object>(
  event: string,
  payload: unknown,
): Promise<Ack<T>> {
  const active = socket;
  if (!active || !active.connected) {
    return Promise.resolve({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "서버와 연결되어 있지 않습니다." },
    } as Ack<T>);
  }
  return new Promise((resolve) => {
    active
      .timeout(ACK_TIMEOUT_MS)
      .emit(event, payload, (timeoutError: Error | null, ack: Ack<T>) => {
        if (timeoutError || !ack) {
          resolve({
            ok: false,
            error: { code: "INTERNAL_ERROR", message: "서버 응답이 없습니다." },
          } as Ack<T>);
          return;
        }
        resolve(ack);
      });
  });
}

export const createRoom = (nickname: string) =>
  emitAck<SeatedAck>(CLIENT_EVENT.roomCreate, { nickname });

export const joinRoom = (roomCode: string, nickname: string) =>
  emitAck<SeatedAck>(CLIENT_EVENT.roomJoin, { roomCode, nickname });

export const leaveRoom = () =>
  emitAck<Record<string, never>>(CLIENT_EVENT.roomLeave, {});

export const sendMove = (from: Square, to: Square) =>
  emitAck<ActionAck>(CLIENT_EVENT.gameMove, { from, to });

export const sendPass = () => emitAck<ActionAck>(CLIENT_EVENT.gamePass, {});

export const sendResign = () => emitAck<ActionAck>(CLIENT_EVENT.gameResign, {});
