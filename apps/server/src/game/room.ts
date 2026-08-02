import { ProtocolException } from "../common/protocol-exception.js";
import {
  type Action,
  type GameState,
  type Piece,
  type Side,
  type Square,
  applyAction,
  initialState,
  isCheck,
  isLegal,
  opponent,
} from "../engine.js";
import type {
  GameSnapshot,
  LastAction,
  MatchResult,
  PlayerInfo,
  RoomInfo,
  RoomStatus,
} from "../protocol.js";

/** What the gateway has to broadcast after a room mutation. */
export type RoomEventKind = "room" | "start" | "state" | "over";

export type RoomListener = (room: Room, kind: RoomEventKind) => void;

export interface RoomPlayer {
  playerId: string;
  nickname: string;
  side: Side;
  host: boolean;
  connected: boolean;
}

export interface RoomOptions {
  code: string;
  turnTimeoutMs: number;
  autoPassLimit: number;
  /** Test seam: start from a crafted position instead of the initial setup. */
  initialGameState?: GameState;
  now?: () => number;
  listener?: RoomListener;
}

const EMPTY_CAPTURES = (): Record<Side, Piece[]> => ({ cho: [], han: [] });

/**
 * One online match. Owns the authoritative engine state, the seats, and the turn clock.
 *
 * Deliberately free of NestJS/socket.io so it can be unit tested with fake timers; the gateway
 * subscribes through `listener` and turns each event into a broadcast.
 */
export class Room {
  readonly code: string;
  readonly turnTimeoutMs: number;
  readonly autoPassLimit: number;

  private readonly players = new Map<string, RoomPlayer>();
  private readonly now: () => number;
  private listener: RoomListener | null;

  private state: GameState;
  private status: RoomStatus = "waiting";
  private outcome: MatchResult | null = null;
  private lastAction: LastAction | null = null;
  private captured: Record<Side, Piece[]> = EMPTY_CAPTURES();
  private autoPassCount: Record<Side, number> = { cho: 0, han: 0 };

  private timer: ReturnType<typeof setTimeout> | null = null;
  private deadline: number | null = null;

  constructor(options: RoomOptions) {
    this.code = options.code;
    this.turnTimeoutMs = options.turnTimeoutMs;
    this.autoPassLimit = options.autoPassLimit;
    this.now = options.now ?? (() => Date.now());
    this.listener = options.listener ?? null;
    this.state = options.initialGameState ?? initialState();
  }

  setListener(listener: RoomListener | null): void {
    this.listener = listener;
  }

  /* ------------------------------------------------------------------ seats */

  get playerCount(): number {
    return this.players.size;
  }

  get connectedCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n++;
    return n;
  }

  get roomStatus(): RoomStatus {
    return this.status;
  }

  get result(): MatchResult | null {
    return this.outcome;
  }

  getPlayer(playerId: string): RoomPlayer | undefined {
    return this.players.get(playerId);
  }

  playerBySide(side: Side): RoomPlayer | undefined {
    for (const p of this.players.values()) if (p.side === side) return p;
    return undefined;
  }

  /** Seats a player. First seat is the host and always plays 초 (cho, moves first). */
  join(playerId: string, nickname: string): RoomPlayer {
    if (this.players.has(playerId)) {
      throw new ProtocolException("ALREADY_IN_ROOM", "this player already has a seat in the room");
    }
    if (this.status !== "waiting") {
      throw new ProtocolException("ROOM_FULL", "the game in this room has already started");
    }
    if (this.players.size >= 2) {
      throw new ProtocolException("ROOM_FULL", "the room already has two players");
    }

    const host = this.players.size === 0;
    const player: RoomPlayer = {
      playerId,
      nickname,
      side: host ? "cho" : "han",
      host,
      connected: true,
    };
    this.players.set(playerId, player);

    if (this.players.size === 2) this.start();
    else this.emit("room");

    return player;
  }

  /** Explicit leave. Abandoning a live game counts as a resignation. */
  leave(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    if (this.status === "playing") {
      // keep the seat so the result screen still shows both nicknames
      player.connected = false;
      this.setResult({ type: "resign", winner: opponent(player.side), loser: player.side });
      this.emit("state");
      this.emit("over");
      return;
    }
    this.players.delete(playerId);
    this.emit("room");
  }

  /**
   * Transport-level drop. Reconnect is out of scope (PRD 3절 제외 목록), so the game keeps
   * running: the clock will auto-pass for the missing player until they forfeit.
   */
  markDisconnected(playerId: string): RoomPlayer | undefined {
    const player = this.players.get(playerId);
    if (!player || !player.connected) return player;
    player.connected = false;
    this.emit("room");
    return player;
  }

  /* ------------------------------------------------------------------- game */

  private start(): void {
    this.status = "playing";
    this.armTimer();
    this.emit("start");
  }

  submitMove(playerId: string, from: Square, to: Square): void {
    this.submit(playerId, { kind: "move", move: { from, to } });
  }

  submitPass(playerId: string): void {
    this.submit(playerId, { kind: "pass" });
  }

  private submit(playerId: string, action: Action): void {
    const player = this.requirePlayer(playerId);
    this.requirePlaying();
    if (this.state.turn !== player.side) {
      throw new ProtocolException("NOT_YOUR_TURN", `it is ${this.state.turn}'s turn`);
    }
    if (action.kind === "move" && !isSquare(action.move.from)) {
      throw new ProtocolException("BAD_PAYLOAD", "`from` is not a board square");
    }
    if (action.kind === "move" && !isSquare(action.move.to)) {
      throw new ProtocolException("BAD_PAYLOAD", "`to` is not a board square");
    }
    if (!isLegal(this.state, action)) {
      if (action.kind === "pass") {
        throw new ProtocolException(
          "ILLEGAL_PASS",
          "한수쉼 is not allowed while your general is in check",
        );
      }
      throw new ProtocolException("ILLEGAL_MOVE", "the engine rejected this move");
    }

    this.commit(player.side, action, false);
    this.emit("state");
    if (this.outcome !== null) this.emit("over");
  }

  resign(playerId: string): void {
    const player = this.requirePlayer(playerId);
    this.requirePlaying();
    this.setResult({ type: "resign", winner: opponent(player.side), loser: player.side });
    this.emit("state");
    this.emit("over");
  }

  /** Applies an action to the engine state and updates bookkeeping. No broadcasting. */
  private commit(side: Side, action: Action, auto: boolean): void {
    const next = applyAction(this.state, action);
    this.state = next;

    const applied = next.history[next.history.length - 1];
    if (applied) {
      if (applied.captured) this.captured[applied.captured.side].push(applied.captured);
      this.lastAction = {
        side,
        kind: action.kind,
        from: action.kind === "move" ? action.move.from : null,
        to: action.kind === "move" ? action.move.to : null,
        notation: applied.notation,
        captured: applied.captured,
        check: applied.check,
        auto,
      };
    }

    if (next.result) {
      this.setResult(
        next.result.type === "checkmate"
          ? { type: "checkmate", winner: next.result.winner }
          : { type: "draw", reason: next.result.reason },
      );
      return;
    }
    this.armTimer();
  }

  /* ------------------------------------------------------------------ clock */

  private armTimer(): void {
    this.clearTimer();
    if (this.status !== "playing") return;
    this.deadline = this.now() + this.turnTimeoutMs;
    this.timer = setTimeout(() => this.handleTimeout(), this.turnTimeoutMs);
    // never keep the process alive just for a turn clock
    const handle = this.timer as unknown as { unref?: () => void };
    if (typeof handle?.unref === "function") handle.unref();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.deadline = null;
  }

  /**
   * Turn clock expiry.
   * - in check: 한수쉼 is illegal, so there is nothing the server can play -> immediate loss.
   * - otherwise: the server plays 한수쉼 for the player and counts it; reaching
   *   `autoPassLimit` (default 2) forfeits the game.
   */
  private handleTimeout(): void {
    try {
      this.runTimeout();
    } catch {
      // a turn clock must never crash the process: end the game defensively
      if (this.status === "playing") {
        const side = this.state.turn;
        this.setResult({ type: "timeout", winner: opponent(side), loser: side });
        this.emit("state");
        this.emit("over");
      }
    }
  }

  private runTimeout(): void {
    if (this.status !== "playing") return;
    this.timer = null;
    this.deadline = null;

    const side = this.state.turn;

    if (isCheck(this.state, side)) {
      this.setResult({ type: "timeout", winner: opponent(side), loser: side });
      this.emit("state");
      this.emit("over");
      return;
    }

    this.autoPassCount[side] += 1;
    this.commit(side, { kind: "pass" }, true);

    if (this.autoPassCount[side] >= this.autoPassLimit) {
      // the anti-stalling ruling wins over any draw the forced pass may have produced
      this.setResult({
        type: "forfeit",
        winner: opponent(side),
        loser: side,
        reason: "auto_pass_limit",
      });
    }

    this.emit("state");
    if (this.outcome !== null) this.emit("over");
  }

  /* ------------------------------------------------------------------ state */

  private setResult(result: MatchResult): void {
    this.clearTimer();
    this.outcome = result;
    this.status = "finished";
  }

  private requirePlayer(playerId: string): RoomPlayer {
    const player = this.players.get(playerId);
    if (!player) throw new ProtocolException("NOT_IN_ROOM", "you do not have a seat in this room");
    return player;
  }

  private requirePlaying(): void {
    if (this.status === "waiting") {
      throw new ProtocolException("GAME_NOT_STARTED", "waiting for an opponent");
    }
    if (this.status === "finished") {
      throw new ProtocolException("GAME_FINISHED", "this game is already over");
    }
  }

  private emit(kind: RoomEventKind): void {
    this.listener?.(this, kind);
  }

  info(): RoomInfo {
    return {
      code: this.code,
      status: this.status,
      players: this.playerInfos(),
      turnTimeoutMs: this.turnTimeoutMs,
      autoPassLimit: this.autoPassLimit,
    };
  }

  private playerInfos(): PlayerInfo[] {
    return [...this.players.values()]
      .sort((a, b) => (a.side === b.side ? 0 : a.side === "cho" ? -1 : 1))
      .map((p) => ({
        side: p.side,
        nickname: p.nickname,
        connected: p.connected,
        host: p.host,
      }));
  }

  snapshot(): GameSnapshot {
    return {
      roomCode: this.code,
      status: this.status,
      board: this.state.board,
      turn: this.state.turn,
      ply: this.state.history.length,
      check: isCheck(this.state, this.state.turn),
      result: this.outcome,
      lastAction: this.lastAction,
      captured: { cho: [...this.captured.cho], han: [...this.captured.han] },
      autoPassCount: { ...this.autoPassCount },
      turnDeadline: this.deadline,
      turnTimeoutMs: this.turnTimeoutMs,
      serverTime: this.now(),
      players: this.playerInfos(),
    };
  }

  /** Frees the turn clock. Called when the room is removed from the registry. */
  dispose(): void {
    this.clearTimer();
    this.listener = null;
  }
}

export function isSquare(value: unknown): value is Square {
  if (typeof value !== "object" || value === null) return false;
  const sq = value as { file?: unknown; rank?: unknown };
  return (
    Number.isInteger(sq.file) &&
    Number.isInteger(sq.rank) &&
    (sq.file as number) >= 0 &&
    (sq.file as number) <= 8 &&
    (sq.rank as number) >= 0 &&
    (sq.rank as number) <= 9
  );
}
