/**
 * socket.io integration test: boots the real Nest application on an ephemeral port and drives
 * it with two real client sockets.
 */
import type { AddressInfo } from "node:net";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { type Socket as ClientSocket, io } from "socket.io-client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module.js";
import {
  type Ack,
  CLIENT_EVENT,
  type GameOverEvent,
  type GameStartEvent,
  type GameStateEvent,
  type OpponentDisconnectedEvent,
  SERVER_EVENT,
  type SeatedAck,
  type ActionAck,
} from "../protocol.js";
import { RoomService } from "./room.service.js";

const WAIT_MS = 5_000;
/** a4 -> a5, the opening 졸 push. */
const SOLDIER_PUSH = { from: { file: 0, rank: 3 }, to: { file: 0, rank: 4 } };

let app: INestApplication;
let url: string;
const openSockets: ClientSocket[] = [];

function connect(): Promise<ClientSocket> {
  const socket = io(url, { transports: ["websocket"], forceNew: true, timeout: WAIT_MS });
  openSockets.push(socket);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connect timeout")), WAIT_MS);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function request<T extends object>(
  socket: ClientSocket,
  event: string,
  payload: unknown = {},
): Promise<Ack<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout: ${event}`)), WAIT_MS);
    socket.emit(event, payload, (response: Ack<T>) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function nextEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`event timeout: ${event}`)), WAIT_MS);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function expectOk<T extends object>(ack: Ack<T>): { ok: true } & T {
  if (!ack.ok) throw new Error(`expected ok, got ${ack.error.code}: ${ack.error.message}`);
  return ack;
}

/** Seats two guests in a fresh room and waits for both game:start broadcasts. */
async function seatTwoGuests(): Promise<{
  host: ClientSocket;
  guest: ClientSocket;
  roomCode: string;
}> {
  const host = await connect();
  const hostStart = nextEvent<GameStartEvent>(host, SERVER_EVENT.gameStart);
  const created = expectOk(
    await request<SeatedAck>(host, CLIENT_EVENT.roomCreate, { nickname: "초보" }),
  );

  const guest = await connect();
  const guestStart = nextEvent<GameStartEvent>(guest, SERVER_EVENT.gameStart);
  const joined = expectOk(
    await request<SeatedAck>(guest, CLIENT_EVENT.roomJoin, {
      roomCode: created.roomCode,
      nickname: "한량",
    }),
  );

  expect(created.side).toBe("cho");
  expect(joined.side).toBe("han");
  await Promise.all([hostStart, guestStart]);
  return { host, guest, roomCode: created.roomCode };
}

beforeAll(async () => {
  process.env.PORT = "0";
  app = await NestFactory.create(AppModule, { logger: false });
  app.useWebSocketAdapter(new IoAdapter(app));
  await app.listen(0, "127.0.0.1");
  const address = (app.getHttpServer() as { address(): AddressInfo }).address();
  url = `http://127.0.0.1:${address.port}`;
});

afterEach(() => {
  for (const socket of openSockets.splice(0)) socket.disconnect();
});

afterAll(async () => {
  app.get(RoomService).disposeAll();
  await app.close();
});

describe("GameGateway (socket.io)", () => {
  it("plays a room through create -> join -> move -> resign", async () => {
    const host = await connect();
    const created = expectOk(
      await request<SeatedAck>(host, CLIENT_EVENT.roomCreate, { nickname: "초보" }),
    );
    expect(created.roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(created.side).toBe("cho");
    expect(created.room.status).toBe("waiting");

    const guest = await connect();
    const hostStart = nextEvent<GameStartEvent>(host, SERVER_EVENT.gameStart);
    const joined = expectOk(
      await request<SeatedAck>(guest, CLIENT_EVENT.roomJoin, {
        roomCode: created.roomCode.toLowerCase(),
        nickname: "한량",
      }),
    );
    expect(joined.side).toBe("han");

    const start = await hostStart;
    expect(start.room.status).toBe("playing");
    expect(start.snapshot.turn).toBe("cho");
    expect(start.room.players.map((p) => p.nickname)).toEqual(["초보", "한량"]);

    // 초 moves; the whole room gets the authoritative snapshot
    const guestState = nextEvent<GameStateEvent>(guest, SERVER_EVENT.gameState);
    const moveAck = expectOk(
      await request<ActionAck>(host, CLIENT_EVENT.gameMove, SOLDIER_PUSH),
    );
    expect(moveAck.snapshot.turn).toBe("han");

    const broadcast = await guestState;
    expect(broadcast.snapshot.lastAction).toMatchObject({
      side: "cho",
      notation: "a4a5",
      auto: false,
    });
    expect(broadcast.snapshot.board[4]?.[0]).toMatchObject({ side: "cho", type: "soldier" });

    // 한 resigns -> both sides see the same result
    const hostOver = nextEvent<GameOverEvent>(host, SERVER_EVENT.gameOver);
    const guestOver = nextEvent<GameOverEvent>(guest, SERVER_EVENT.gameOver);
    expectOk(await request<ActionAck>(guest, CLIENT_EVENT.gameResign));

    for (const over of await Promise.all([hostOver, guestOver])) {
      expect(over.result).toEqual({ type: "resign", winner: "cho", loser: "han" });
      expect(over.snapshot.status).toBe("finished");
    }
  });

  it("rejects out-of-turn and illegal moves through the ack", async () => {
    const { host, guest } = await seatTwoGuests();

    const outOfTurn = await request<ActionAck>(guest, CLIENT_EVENT.gameMove, SOLDIER_PUSH);
    expect(outOfTurn.ok).toBe(false);
    expect(outOfTurn.ok === false && outOfTurn.error.code).toBe("NOT_YOUR_TURN");

    const illegal = await request<ActionAck>(host, CLIENT_EVENT.gameMove, {
      from: { file: 4, rank: 1 },
      to: { file: 4, rank: 4 },
    });
    expect(illegal.ok === false && illegal.error.code).toBe("ILLEGAL_MOVE");

    const malformed = await request<ActionAck>(host, CLIENT_EVENT.gameMove, { from: "a4" });
    expect(malformed.ok === false && malformed.error.code).toBe("BAD_PAYLOAD");

    const sync = expectOk(await request(host, CLIENT_EVENT.roomSync));
    expect((sync as { snapshot: { ply: number } }).snapshot.ply).toBe(0);
  });

  it("rejects joining an unknown or full room", async () => {
    const { roomCode } = await seatTwoGuests();

    const stranger = await connect();
    const full = await request<SeatedAck>(stranger, CLIENT_EVENT.roomJoin, {
      roomCode,
      nickname: "구경꾼",
    });
    expect(full.ok === false && full.error.code).toBe("ROOM_FULL");

    const missing = await request<SeatedAck>(stranger, CLIENT_EVENT.roomJoin, {
      roomCode: "ZZZZZZ",
      nickname: "구경꾼",
    });
    expect(missing.ok === false && missing.error.code).toBe("ROOM_NOT_FOUND");

    const anonymous = await request<SeatedAck>(stranger, CLIENT_EVENT.roomCreate, {});
    expect(anonymous.ok === false && anonymous.error.code).toBe("INVALID_NICKNAME");

    const seatless = await request<ActionAck>(stranger, CLIENT_EVENT.gamePass);
    expect(seatless.ok === false && seatless.error.code).toBe("NOT_IN_ROOM");
  });

  it("tells the remaining player when the opponent drops", async () => {
    const { host, guest } = await seatTwoGuests();
    const notice = nextEvent<OpponentDisconnectedEvent>(host, SERVER_EVENT.opponentDisconnected);

    guest.disconnect();

    expect(await notice).toEqual({ side: "han", nickname: "한량" });
  });

  it("serves the health probe", async () => {
    const response = await fetch(`${url}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, service: "janggi-arena-server" });
  });
});
