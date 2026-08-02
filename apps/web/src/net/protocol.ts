/**
 * Wire protocol mirror for the online match server (apps/server/PROTOCOL.md).
 *
 * apps/server is not a dependency of apps/web (the web bundle must never pull
 * NestJS in), so the contract is re-declared here — types only, plus the event
 * name constants. The board/coordinate types are imported straight from
 * `engine`, which both sides already share, so there is no conversion layer.
 *
 * RULE: this file is a copy of `apps/server/src/protocol.ts`. If the server
 * changes, change this to match; never fork the semantics.
 */
import type { Board, Piece, Side, Square } from "engine";

/** Client → server. Every one of them answers through an ack callback. */
export const CLIENT_EVENT = {
  roomCreate: "room:create",
  roomJoin: "room:join",
  roomLeave: "room:leave",
  roomSync: "room:sync",
  gameMove: "game:move",
  gamePass: "game:pass",
  gameResign: "game:resign",
} as const;

/** Server → client broadcasts. */
export const SERVER_EVENT = {
  roomUpdate: "room:update",
  gameStart: "game:start",
  gameState: "game:state",
  gameOver: "game:over",
  opponentDisconnected: "opponent:disconnected",
} as const;

export type ErrorCode =
  | "BAD_PAYLOAD"
  | "INVALID_NICKNAME"
  | "INVALID_ROOM_CODE"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ALREADY_IN_ROOM"
  | "NOT_IN_ROOM"
  | "GAME_NOT_STARTED"
  | "GAME_FINISHED"
  | "NOT_YOUR_TURN"
  | "ILLEGAL_MOVE"
  | "ILLEGAL_PASS"
  | "INTERNAL_ERROR";

export interface ProtocolError {
  code: ErrorCode;
  message: string;
}

export type Ack<T extends object = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: ProtocolError };

export type RoomStatus = "waiting" | "playing" | "finished";

export interface PlayerInfo {
  side: Side;
  nickname: string;
  connected: boolean;
  /** the player who created the room (always plays 초) */
  host: boolean;
}

export interface RoomInfo {
  code: string;
  status: RoomStatus;
  players: PlayerInfo[];
  turnTimeoutMs: number;
  autoPassLimit: number;
}

export type MatchResult =
  | { type: "checkmate"; winner: Side }
  | { type: "draw"; reason: "facing" | "repetition" }
  | { type: "resign"; winner: Side; loser: Side }
  | { type: "timeout"; winner: Side; loser: Side }
  | { type: "forfeit"; winner: Side; loser: Side; reason: "auto_pass_limit" };

export interface LastAction {
  side: Side;
  kind: "move" | "pass";
  from: Square | null;
  to: Square | null;
  notation: string;
  /** capture cinematic trigger — same shape P3 already consumes */
  captured: Piece | null;
  check: boolean;
  /** the server played this action because the clock ran out */
  auto: boolean;
}

export interface GameSnapshot {
  roomCode: string;
  status: RoomStatus;
  board: Board;
  turn: Side;
  /** number of actions applied so far */
  ply: number;
  check: boolean;
  result: MatchResult | null;
  lastAction: LastAction | null;
  /** `captured[side]` = pieces that side has *lost* */
  captured: Record<Side, Piece[]>;
  autoPassCount: Record<Side, number>;
  /** epoch ms deadline for the side to move (null when not playing) */
  turnDeadline: number | null;
  turnTimeoutMs: number;
  /** server clock at snapshot time — clients correct their own drift with it */
  serverTime: number;
  players: PlayerInfo[];
}

export interface SeatedAck {
  roomCode: string;
  playerId: string;
  side: Side;
  room: RoomInfo;
  snapshot: GameSnapshot;
}

export interface ActionAck {
  snapshot: GameSnapshot;
}

export interface SyncAck {
  room: RoomInfo;
  snapshot: GameSnapshot;
}

export interface GameStartEvent {
  room: RoomInfo;
  snapshot: GameSnapshot;
}

export interface GameStateEvent {
  snapshot: GameSnapshot;
}

export interface GameOverEvent {
  snapshot: GameSnapshot;
  result: MatchResult;
}

export interface RoomUpdateEvent {
  room: RoomInfo;
}

export interface OpponentDisconnectedEvent {
  side: Side;
  nickname: string;
}

/** 사용자에게 보여줄 한국어 메시지 (에러 코드는 서버 계약, 문구는 클라이언트 결정). */
export const ERROR_MESSAGE: Record<ErrorCode, string> = {
  BAD_PAYLOAD: "잘못된 요청입니다.",
  INVALID_NICKNAME: "닉네임은 1~16자여야 합니다.",
  INVALID_ROOM_CODE: "방 코드는 6자리입니다.",
  ROOM_NOT_FOUND: "그런 방이 없습니다. 코드를 확인해 주세요.",
  ROOM_FULL: "이미 대국이 시작되었거나 정원이 찼습니다.",
  ALREADY_IN_ROOM: "이미 다른 방에 참가 중입니다.",
  NOT_IN_ROOM: "방에 참가하지 않았습니다.",
  GAME_NOT_STARTED: "아직 상대가 입장하지 않았습니다.",
  GAME_FINISHED: "이미 종료된 대국입니다.",
  NOT_YOUR_TURN: "상대 차례입니다.",
  ILLEGAL_MOVE: "둘 수 없는 수입니다.",
  ILLEGAL_PASS: "장군 상태에서는 한수쉼을 할 수 없습니다.",
  INTERNAL_ERROR: "서버 오류가 발생했습니다.",
};

export function errorMessage(error: ProtocolError | null | undefined): string {
  if (!error) return "알 수 없는 오류가 발생했습니다.";
  return ERROR_MESSAGE[error.code] ?? error.message;
}
