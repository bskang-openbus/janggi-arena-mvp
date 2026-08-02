import { Inject, Injectable } from "@nestjs/common";
import { ProtocolException } from "../common/protocol-exception.js";
import { SERVER_CONFIG, type ServerConfig } from "../config.js";
import type { GameState } from "../engine.js";
import { sanitizeNickname } from "./nickname.js";
import { Room, type RoomListener, type RoomPlayer } from "./room.js";
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from "./room-code.js";

export interface SeatResult {
  room: Room;
  player: RoomPlayer;
}

export interface CreateRoomOptions {
  /** Test seam: seed the match with a crafted position. Never reachable from the wire. */
  initialGameState?: GameState;
  turnTimeoutMs?: number;
  autoPassLimit?: number;
}

/**
 * In-memory room registry. Rooms live only as long as somebody is connected to them —
 * there is no persistence and no reconnect (PRD 3절 제외 목록).
 */
@Injectable()
export class RoomService {
  private readonly rooms = new Map<string, Room>();
  /** playerId (socket id) -> room code */
  private readonly seats = new Map<string, string>();
  private listener: RoomListener | null = null;

  constructor(@Inject(SERVER_CONFIG) private readonly config: ServerConfig) {}

  setListener(listener: RoomListener | null): void {
    this.listener = listener;
    for (const room of this.rooms.values()) room.setListener(listener);
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  roomOf(playerId: string): Room | undefined {
    const code = this.seats.get(playerId);
    return code === undefined ? undefined : this.rooms.get(code);
  }

  requireRoomOf(playerId: string): Room {
    const room = this.roomOf(playerId);
    if (!room) throw new ProtocolException("NOT_IN_ROOM", "you are not in a room");
    return room;
  }

  createRoom(playerId: string, rawNickname: unknown, options: CreateRoomOptions = {}): SeatResult {
    const nickname = sanitizeNickname(rawNickname);
    this.assertUnseated(playerId);

    const code = generateRoomCode((candidate) => this.rooms.has(candidate));
    const room = new Room({
      code,
      turnTimeoutMs: options.turnTimeoutMs ?? this.config.turnTimeoutMs,
      autoPassLimit: options.autoPassLimit ?? this.config.autoPassLimit,
      ...(options.initialGameState ? { initialGameState: options.initialGameState } : {}),
      ...(this.listener ? { listener: this.listener } : {}),
    });
    this.rooms.set(code, room);

    const player = room.join(playerId, nickname);
    this.seats.set(playerId, code);
    return { room, player };
  }

  /**
   * Resolves a user supplied code to a live room without seating anybody. The gateway calls
   * this first so the socket can subscribe to the room channel *before* the seat is taken —
   * otherwise the joining player would miss the `game:start` broadcast it triggers itself.
   */
  resolveRoom(rawCode: unknown): Room {
    if (typeof rawCode !== "string") {
      throw new ProtocolException("INVALID_ROOM_CODE", "roomCode must be a string");
    }
    const code = normalizeRoomCode(rawCode);
    if (!isValidRoomCode(code)) {
      throw new ProtocolException("INVALID_ROOM_CODE", "room codes are 6 alphanumeric characters");
    }
    const room = this.rooms.get(code);
    if (!room) throw new ProtocolException("ROOM_NOT_FOUND", `no room with code ${code}`);
    return room;
  }

  joinRoom(playerId: string, rawCode: unknown, rawNickname: unknown): SeatResult {
    const room = this.resolveRoom(rawCode);
    const nickname = sanitizeNickname(rawNickname);
    this.assertUnseated(playerId);

    const player = room.join(playerId, nickname);
    this.seats.set(playerId, room.code);
    return { room, player };
  }

  /** Explicit leave (resigns a live game). */
  leave(playerId: string): Room | undefined {
    const room = this.roomOf(playerId);
    this.seats.delete(playerId);
    if (!room) return undefined;
    room.leave(playerId);
    this.collect(room);
    return room;
  }

  /** Transport drop: the opponent is notified, the game keeps running on the clock. */
  disconnect(playerId: string): { room: Room; player: RoomPlayer } | undefined {
    const room = this.roomOf(playerId);
    this.seats.delete(playerId);
    if (!room) return undefined;
    const player = room.markDisconnected(playerId);
    this.collect(room);
    return player ? { room, player } : undefined;
  }

  /** Drops rooms nobody is connected to so turn clocks cannot leak. */
  private collect(room: Room): void {
    if (room.connectedCount > 0) return;
    room.dispose();
    this.rooms.delete(room.code);
    for (const [playerId, code] of this.seats) {
      if (code === room.code) this.seats.delete(playerId);
    }
  }

  /** Test/shutdown helper: clears every timer. */
  disposeAll(): void {
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
    this.seats.clear();
  }

  private assertUnseated(playerId: string): void {
    if (this.seats.has(playerId)) {
      throw new ProtocolException("ALREADY_IN_ROOM", "leave your current room first");
    }
  }
}
