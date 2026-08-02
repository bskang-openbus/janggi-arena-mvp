import { beforeEach, describe, expect, it } from "vitest";
import { ProtocolException } from "../common/protocol-exception.js";
import type { ServerConfig } from "../config.js";
import type { ErrorCode } from "../protocol.js";
import { RoomService } from "./room.service.js";

const config: ServerConfig = {
  port: 0,
  host: "127.0.0.1",
  turnTimeoutMs: 60_000,
  autoPassLimit: 2,
  corsOrigin: true,
};

function codeOf(error: unknown): ErrorCode {
  expect(error).toBeInstanceOf(ProtocolException);
  return (error as ProtocolException).code;
}

function expectFailure(run: () => unknown, expected: ErrorCode): void {
  try {
    run();
    expect.unreachable(`expected ${expected}`);
  } catch (error) {
    expect(codeOf(error)).toBe(expected);
  }
}

describe("RoomService", () => {
  let service: RoomService;

  beforeEach(() => {
    service = new RoomService(config);
  });

  it("creates a room, seats the host as 초 and waits for an opponent", () => {
    const { room, player } = service.createRoom("socket-a", "초보");

    expect(room.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(player.side).toBe("cho");
    expect(player.host).toBe(true);
    expect(room.roomStatus).toBe("waiting");
    expect(service.roomCount).toBe(1);
    expect(service.roomOf("socket-a")).toBe(room);
  });

  it("seats the second player as 한 and starts the game", () => {
    const { room } = service.createRoom("socket-a", "초보");
    const joined = service.joinRoom("socket-b", room.code, "한량");

    expect(joined.room).toBe(room);
    expect(joined.player.side).toBe("han");
    expect(joined.player.host).toBe(false);
    expect(room.roomStatus).toBe("playing");
    expect(room.snapshot().turn).toBe("cho");
    expect(room.info().players.map((p) => p.nickname)).toEqual(["초보", "한량"]);
  });

  it("accepts lower case / dashed room codes", () => {
    const { room } = service.createRoom("socket-a", "초보");
    const typed = ` ${room.code.slice(0, 3).toLowerCase()}-${room.code.slice(3).toLowerCase()} `;
    expect(service.joinRoom("socket-b", typed, "한량").room).toBe(room);
  });

  it("refuses a third player", () => {
    const { room } = service.createRoom("socket-a", "초보");
    service.joinRoom("socket-b", room.code, "한량");
    expectFailure(() => service.joinRoom("socket-c", room.code, "구경꾼"), "ROOM_FULL");
    expect(room.playerCount).toBe(2);
  });

  it("rejects unknown and malformed room codes", () => {
    expectFailure(() => service.joinRoom("socket-b", "ZZZZZZ", "한량"), "ROOM_NOT_FOUND");
    expectFailure(() => service.joinRoom("socket-b", "TOOLONGCODE", "한량"), "INVALID_ROOM_CODE");
    expectFailure(() => service.joinRoom("socket-b", 12345, "한량"), "INVALID_ROOM_CODE");
  });

  it("rejects bad nicknames before allocating anything", () => {
    expectFailure(() => service.createRoom("socket-a", "   "), "INVALID_NICKNAME");
    expect(service.roomCount).toBe(0);
  });

  it("keeps one seat per socket", () => {
    const { room } = service.createRoom("socket-a", "초보");
    expectFailure(() => service.createRoom("socket-a", "초보2"), "ALREADY_IN_ROOM");
    expectFailure(() => service.joinRoom("socket-a", room.code, "초보3"), "ALREADY_IN_ROOM");
  });

  it("requires a seat before playing", () => {
    expectFailure(() => service.requireRoomOf("nobody"), "NOT_IN_ROOM");
  });

  it("drops the room once nobody is connected any more", () => {
    const { room } = service.createRoom("socket-a", "초보");
    service.joinRoom("socket-b", room.code, "한량");

    service.disconnect("socket-a");
    expect(service.roomCount).toBe(1);
    expect(room.info().players.find((p) => p.side === "cho")?.connected).toBe(false);

    service.disconnect("socket-b");
    expect(service.roomCount).toBe(0);
    expect(service.roomOf("socket-b")).toBeUndefined();
  });

  it("frees an empty waiting room when the host leaves", () => {
    service.createRoom("socket-a", "초보");
    service.leave("socket-a");
    expect(service.roomCount).toBe(0);
  });

  it("hands out unique codes for concurrent rooms", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) codes.add(service.createRoom(`socket-${i}`, `p${i}`).room.code);
    expect(codes.size).toBe(50);
    expect(service.roomCount).toBe(50);
    service.disposeAll();
  });
});
