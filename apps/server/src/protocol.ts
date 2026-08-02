/**
 * Wire protocol between the web client and the online match server.
 * This file is the single source of truth for apps/server/PROTOCOL.md.
 *
 * Rules of the road:
 * - Every client -> server event answers through a socket.io ack callback with `Ack<T>`.
 * - Every state change is broadcast to the whole room; clients never compute rules themselves.
 * - Coordinates use the engine coordinate system (file 0..8 = a..i, rank 0..9 = 1..10).
 */
import type { Board, Piece, Side, Square } from "./engine.js";

/* -------------------------------------------------------------- event names */

/** Client -> server. All of them take an ack callback. */
export const CLIENT_EVENT = {
  roomCreate: "room:create",
  roomJoin: "room:join",
  roomLeave: "room:leave",
  roomSync: "room:sync",
  gameMove: "game:move",
  gamePass: "game:pass",
  gameResign: "game:resign",
} as const;

/** Server -> client broadcasts. */
export const SERVER_EVENT = {
  roomUpdate: "room:update",
  gameStart: "game:start",
  gameState: "game:state",
  gameOver: "game:over",
  opponentDisconnected: "opponent:disconnected",
} as const;

export type ClientEvent = (typeof CLIENT_EVENT)[keyof typeof CLIENT_EVENT];
export type ServerEvent = (typeof SERVER_EVENT)[keyof typeof SERVER_EVENT];

/* -------------------------------------------------------------------- errors */

export const ERROR_CODES = [
  "BAD_PAYLOAD", // payload shape/type is wrong
  "INVALID_NICKNAME", // empty or too long after sanitising
  "INVALID_ROOM_CODE", // not 6 chars of the room alphabet
  "ROOM_NOT_FOUND", // no live room with that code
  "ROOM_FULL", // already 2 players, or the game already started
  "ALREADY_IN_ROOM", // this socket is already seated somewhere
  "NOT_IN_ROOM", // action sent by a socket without a seat
  "GAME_NOT_STARTED", // still waiting for the opponent
  "GAME_FINISHED", // the game already has a result
  "NOT_YOUR_TURN",
  "ILLEGAL_MOVE", // rejected by the engine
  "ILLEGAL_PASS", // 한수쉼 attempted while in check
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ProtocolError {
  code: ErrorCode;
  message: string;
}

export type Ack<T extends object = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: ProtocolError };

/* ------------------------------------------------------------------ payloads */

export interface CreateRoomPayload {
  nickname: string;
}

export interface JoinRoomPayload {
  roomCode: string;
  nickname: string;
}

export interface MovePayload {
  from: Square;
  to: Square;
}

/* ---------------------------------------------------------------- room/state */

export type RoomStatus = "waiting" | "playing" | "finished";

export interface PlayerInfo {
  side: Side;
  nickname: string;
  connected: boolean;
  /** The player who created the room (always plays 초). */
  host: boolean;
}

export interface RoomInfo {
  code: string;
  status: RoomStatus;
  players: PlayerInfo[];
  turnTimeoutMs: number;
  autoPassLimit: number;
}

/**
 * Outcome of a finished game. `checkmate`/`draw` come straight from the engine;
 * the remaining variants are server rulings (see PROTOCOL.md).
 */
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
  /** "e2e3" for moves, "pass" for 한수쉼. */
  notation: string;
  captured: Piece | null;
  /** true when the side to move *after* this action is in check. */
  check: boolean;
  /** true when the server played this action for a player whose clock ran out. */
  auto: boolean;
}

export interface GameSnapshot {
  roomCode: string;
  status: RoomStatus;
  board: Board;
  turn: Side;
  /** Number of actions applied so far. */
  ply: number;
  /** Is the side to move in check right now? */
  check: boolean;
  result: MatchResult | null;
  lastAction: LastAction | null;
  /** `captured[side]` = pieces of that side which have been taken off the board. */
  captured: Record<Side, Piece[]>;
  autoPassCount: Record<Side, number>;
  /** Epoch ms deadline for the side to move (null when not playing). */
  turnDeadline: number | null;
  turnTimeoutMs: number;
  /** Server clock at snapshot time; clients use it to correct for drift. */
  serverTime: number;
  players: PlayerInfo[];
}

/* -------------------------------------------------------------- ack payloads */

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

/* ------------------------------------------------- server -> client payloads */

export interface RoomUpdateEvent {
  room: RoomInfo;
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

export interface OpponentDisconnectedEvent {
  side: Side;
  nickname: string;
}

/** socket.io room name used for broadcasts. */
export const roomChannel = (code: string): string => `room:${code}`;
