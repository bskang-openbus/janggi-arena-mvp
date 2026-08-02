import { Inject } from "@nestjs/common";
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { ProtocolException, toAck } from "../common/protocol-exception.js";
import {
  type Ack,
  type ActionAck,
  CLIENT_EVENT,
  SERVER_EVENT,
  type SeatedAck,
  type SyncAck,
  roomChannel,
} from "../protocol.js";
import { type Room, type RoomEventKind, isSquare } from "./room.js";
import { RoomService } from "./room.service.js";

/**
 * socket.io entry point. Every handler answers through the ack callback and never trusts the
 * client for anything but intent: the room object owns the engine state and the clock.
 */
@WebSocketGateway({
  cors: { origin: true, credentials: true },
  // one namespace, rooms are socket.io rooms named `room:<CODE>`
})
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private server: Server | null = null;

  constructor(@Inject(RoomService) private readonly rooms: RoomService) {}

  afterInit(server: Server): void {
    this.server = server;
    this.rooms.setListener((room, kind) => this.broadcast(room, kind));
  }

  handleConnection(): void {
    // guests are anonymous until they create/join a room
  }

  handleDisconnect(client: Socket): void {
    const dropped = this.rooms.disconnect(client.id);
    if (!dropped) return;
    const { room, player } = dropped;
    this.server?.to(roomChannel(room.code)).emit(SERVER_EVENT.opponentDisconnected, {
      side: player.side,
      nickname: player.nickname,
    });
  }

  /* -------------------------------------------------------------- lobby */

  @SubscribeMessage(CLIENT_EVENT.roomCreate)
  onRoomCreate(client: Socket, payload: unknown): Ack<SeatedAck> {
    return toAck(() => {
      const nickname = readNickname(payload);
      const { room, player } = this.rooms.createRoom(client.id, nickname);
      client.join(roomChannel(room.code));
      return this.seated(room, player.playerId);
    });
  }

  @SubscribeMessage(CLIENT_EVENT.roomJoin)
  onRoomJoin(client: Socket, payload: unknown): Ack<SeatedAck> {
    return toAck(() => {
      const body = asRecord(payload);
      // subscribe to the channel *before* taking the seat: seating the second player starts the
      // game and broadcasts game:start synchronously, and this client must receive it too.
      const target = this.rooms.resolveRoom(body.roomCode);
      const channel = roomChannel(target.code);
      client.join(channel);
      try {
        const { room, player } = this.rooms.joinRoom(client.id, target.code, body.nickname);
        return this.seated(room, player.playerId);
      } catch (error) {
        client.leave(channel);
        throw error;
      }
    });
  }

  @SubscribeMessage(CLIENT_EVENT.roomLeave)
  onRoomLeave(client: Socket): Ack {
    return toAck(() => {
      const room = this.rooms.roomOf(client.id);
      this.rooms.leave(client.id);
      if (room) client.leave(roomChannel(room.code));
      return {} as Record<string, never>;
    });
  }

  @SubscribeMessage(CLIENT_EVENT.roomSync)
  onRoomSync(client: Socket): Ack<SyncAck> {
    return toAck(() => {
      const room = this.rooms.requireRoomOf(client.id);
      return { room: room.info(), snapshot: room.snapshot() };
    });
  }

  /* --------------------------------------------------------------- game */

  @SubscribeMessage(CLIENT_EVENT.gameMove)
  onGameMove(client: Socket, payload: unknown): Ack<ActionAck> {
    return toAck(() => {
      const body = asRecord(payload);
      if (!isSquare(body.from) || !isSquare(body.to)) {
        throw new ProtocolException("BAD_PAYLOAD", "expected { from: Square, to: Square }");
      }
      const room = this.rooms.requireRoomOf(client.id);
      room.submitMove(client.id, body.from, body.to);
      return { snapshot: room.snapshot() };
    });
  }

  @SubscribeMessage(CLIENT_EVENT.gamePass)
  onGamePass(client: Socket): Ack<ActionAck> {
    return toAck(() => {
      const room = this.rooms.requireRoomOf(client.id);
      room.submitPass(client.id);
      return { snapshot: room.snapshot() };
    });
  }

  @SubscribeMessage(CLIENT_EVENT.gameResign)
  onGameResign(client: Socket): Ack<ActionAck> {
    return toAck(() => {
      const room = this.rooms.requireRoomOf(client.id);
      room.resign(client.id);
      return { snapshot: room.snapshot() };
    });
  }

  /* ---------------------------------------------------------- internals */

  private seated(room: Room, playerId: string): SeatedAck {
    const player = room.getPlayer(playerId);
    if (!player) throw new ProtocolException("INTERNAL_ERROR", "seat vanished");
    return {
      roomCode: room.code,
      playerId,
      side: player.side,
      room: room.info(),
      snapshot: room.snapshot(),
    };
  }

  private broadcast(room: Room, kind: RoomEventKind): void {
    const server = this.server;
    if (!server) return;
    const channel = server.to(roomChannel(room.code));
    switch (kind) {
      case "room":
        channel.emit(SERVER_EVENT.roomUpdate, { room: room.info() });
        return;
      case "start":
        channel.emit(SERVER_EVENT.gameStart, { room: room.info(), snapshot: room.snapshot() });
        return;
      case "state":
        channel.emit(SERVER_EVENT.gameState, { snapshot: room.snapshot() });
        return;
      case "over": {
        const result = room.result;
        if (!result) return;
        channel.emit(SERVER_EVENT.gameOver, { snapshot: room.snapshot(), result });
        return;
      }
    }
  }
}

function asRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new ProtocolException("BAD_PAYLOAD", "expected an object payload");
  }
  return payload as Record<string, unknown>;
}

function readNickname(payload: unknown): unknown {
  return asRecord(payload).nickname;
}
