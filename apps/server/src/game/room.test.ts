import { describe, expect, it, vi } from "vitest";
import { ProtocolException } from "../common/protocol-exception.js";
import type { GameState } from "../engine.js";
import type { ErrorCode } from "../protocol.js";
import { pos, sq } from "../testing/positions.js";
import { Room, type RoomEventKind } from "./room.js";

const CHO = "socket-cho";
const HAN = "socket-han";

interface Harness {
  room: Room;
  events: RoomEventKind[];
}

/** Two seated players; the host (CHO) plays 초 and moves first. */
function seatedRoom(initialGameState?: GameState): Harness {
  const events: RoomEventKind[] = [];
  const room = new Room({
    code: "TEST01",
    turnTimeoutMs: 60_000,
    autoPassLimit: 2,
    listener: (_room, kind) => events.push(kind),
    ...(initialGameState ? { initialGameState } : {}),
  });
  room.join(CHO, "초보");
  room.join(HAN, "한량");
  return { room, events };
}

function expectFailure(run: () => unknown, expected: ErrorCode): void {
  try {
    run();
    expect.unreachable(`expected ${expected}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ProtocolException);
    expect((error as ProtocolException).code).toBe(expected);
  }
}

describe("Room — seating", () => {
  it("emits room -> start as players arrive", () => {
    const events: RoomEventKind[] = [];
    const room = new Room({
      code: "TEST02",
      turnTimeoutMs: 60_000,
      autoPassLimit: 2,
      listener: (_r, kind) => events.push(kind),
    });
    room.join(CHO, "초보");
    expect(events).toEqual(["room"]);
    expect(room.roomStatus).toBe("waiting");

    room.join(HAN, "한량");
    expect(events).toEqual(["room", "start"]);
    expect(room.roomStatus).toBe("playing");
    room.dispose();
  });

  it("refuses actions before the game starts", () => {
    const room = new Room({ code: "TEST03", turnTimeoutMs: 60_000, autoPassLimit: 2 });
    room.join(CHO, "초보");
    expectFailure(() => room.submitMove(CHO, sq("a4"), sq("a5")), "GAME_NOT_STARTED");
    expectFailure(() => room.submitMove("stranger", sq("a4"), sq("a5")), "NOT_IN_ROOM");
    room.dispose();
  });
});

describe("Room — server authoritative validation", () => {
  it("applies a legal move and flips the turn", () => {
    const { room, events } = seatedRoom();
    room.submitMove(CHO, sq("a4"), sq("a5"));

    const snap = room.snapshot();
    expect(snap.turn).toBe("han");
    expect(snap.ply).toBe(1);
    expect(snap.lastAction).toMatchObject({ side: "cho", notation: "a4a5", auto: false });
    expect(snap.board[4]?.[0]).toMatchObject({ side: "cho", type: "soldier" });
    expect(snap.board[3]?.[0]).toBeNull();
    expect(events).toEqual(["room", "start", "state"]);
    room.dispose();
  });

  it("rejects an illegal move without touching the state", () => {
    const { room } = seatedRoom();
    expectFailure(() => room.submitMove(CHO, sq("e2"), sq("e5")), "ILLEGAL_MOVE");
    expect(room.snapshot().ply).toBe(0);
    expect(room.snapshot().turn).toBe("cho");
    room.dispose();
  });

  it("rejects a move from the wrong side and out of range squares", () => {
    const { room } = seatedRoom();
    expectFailure(() => room.submitMove(HAN, sq("a7"), sq("a6")), "NOT_YOUR_TURN");
    expectFailure(
      () => room.submitMove(CHO, { file: 9, rank: 3 }, { file: 9, rank: 4 }),
      "BAD_PAYLOAD",
    );
    room.dispose();
  });

  it("records captured pieces per side", () => {
    const { room } = seatedRoom(
      pos(
        {
          a1: ["cho", "chariot"],
          a5: ["han", "soldier"],
          d1: ["cho", "general"],
          f9: ["han", "general"],
        },
        "cho",
      ),
    );
    room.submitMove(CHO, sq("a1"), sq("a5"));

    const snap = room.snapshot();
    expect(snap.lastAction?.captured).toMatchObject({ side: "han", type: "soldier" });
    expect(snap.captured.han).toHaveLength(1);
    expect(snap.captured.cho).toHaveLength(0);
    room.dispose();
  });
});

describe("Room — 한수쉼 (pass)", () => {
  it("passes the turn", () => {
    const { room } = seatedRoom();
    room.submitPass(CHO);
    expect(room.snapshot().turn).toBe("han");
    expect(room.snapshot().lastAction?.notation).toBe("pass");
    room.dispose();
  });

  it("refuses a pass while in check", () => {
    const { room } = seatedRoom(
      pos({ e1: ["cho", "general"], a1: ["han", "chariot"], d8: ["han", "general"] }, "cho"),
    );
    expect(room.snapshot().check).toBe(true);
    expectFailure(() => room.submitPass(CHO), "ILLEGAL_PASS");
    room.dispose();
  });
});

describe("Room — game endings", () => {
  it("propagates 외통 (checkmate) from the engine", () => {
    const { room, events } = seatedRoom(
      pos(
        {
          e1: ["cho", "general"],
          c5: ["han", "chariot"],
          b2: ["han", "chariot"],
          d8: ["han", "general"],
        },
        "han",
      ),
    );
    room.submitMove(HAN, sq("c5"), sq("c1"));

    expect(room.result).toEqual({ type: "checkmate", winner: "han" });
    expect(room.roomStatus).toBe("finished");
    expect(room.snapshot().check).toBe(true);
    expect(events.slice(-2)).toEqual(["state", "over"]);
    expectFailure(() => room.submitMove(CHO, sq("e1"), sq("e2")), "GAME_FINISHED");
    room.dispose();
  });

  it("propagates 빅장 (facing generals) as a draw", () => {
    const { room } = seatedRoom(pos({ e5: ["cho", "soldier"] }, "cho"));
    room.submitMove(CHO, sq("e5"), sq("d5"));

    expect(room.result).toEqual({ type: "draw", reason: "facing" });
    expect(room.roomStatus).toBe("finished");
    room.dispose();
  });

  it("propagates the 3-fold repetition draw", () => {
    const { room } = seatedRoom(
      pos(
        {
          a1: ["cho", "chariot"],
          i10: ["han", "chariot"],
          d1: ["cho", "general"],
          f9: ["han", "general"],
        },
        "cho",
      ),
    );
    // shuffle both chariots back and forth until the position repeats a third time
    room.submitMove(CHO, sq("a1"), sq("a2"));
    room.submitMove(HAN, sq("i10"), sq("i9"));
    room.submitMove(CHO, sq("a2"), sq("a1"));
    room.submitMove(HAN, sq("i9"), sq("i10"));
    room.submitMove(CHO, sq("a1"), sq("a2"));
    room.submitMove(HAN, sq("i10"), sq("i9"));
    room.submitMove(CHO, sq("a2"), sq("a1"));
    room.submitMove(HAN, sq("i9"), sq("i10"));

    expect(room.result).toEqual({ type: "draw", reason: "repetition" });
    room.dispose();
  });

  it("gives the win to the opponent on resignation", () => {
    const { room, events } = seatedRoom();
    room.resign(HAN);

    expect(room.result).toEqual({ type: "resign", winner: "cho", loser: "han" });
    expect(room.roomStatus).toBe("finished");
    expect(events.slice(-2)).toEqual(["state", "over"]);
    expectFailure(() => room.resign(CHO), "GAME_FINISHED");
    room.dispose();
  });

  it("treats leaving a live game as a resignation but keeps both names", () => {
    const { room } = seatedRoom();
    room.leave(CHO);

    expect(room.result).toEqual({ type: "resign", winner: "han", loser: "cho" });
    expect(room.info().players).toHaveLength(2);
    expect(room.info().players.find((p) => p.side === "cho")?.connected).toBe(false);
    room.dispose();
  });

  it("keeps the game alive when a player only drops the connection", () => {
    const { room, events } = seatedRoom();
    const dropped = room.markDisconnected(HAN);

    expect(dropped?.side).toBe("han");
    expect(room.roomStatus).toBe("playing");
    expect(room.result).toBeNull();
    expect(events.at(-1)).toBe("room");
    expect(room.connectedCount).toBe(1);
    room.dispose();
  });
});

describe("Room — snapshots", () => {
  it("exposes everything a client needs to render", () => {
    const now = vi.fn(() => 1_000);
    const room = new Room({ code: "TEST04", turnTimeoutMs: 60_000, autoPassLimit: 2, now });
    room.join(CHO, "초보");
    room.join(HAN, "한량");

    const snap = room.snapshot();
    expect(snap).toMatchObject({
      roomCode: "TEST04",
      status: "playing",
      turn: "cho",
      ply: 0,
      check: false,
      result: null,
      lastAction: null,
      autoPassCount: { cho: 0, han: 0 },
      turnTimeoutMs: 60_000,
      turnDeadline: 61_000,
      serverTime: 1_000,
    });
    expect(snap.board).toHaveLength(10);
    expect(snap.board[0]).toHaveLength(9);
    expect(snap.players).toEqual([
      { side: "cho", nickname: "초보", connected: true, host: true },
      { side: "han", nickname: "한량", connected: true, host: false },
    ]);
    room.dispose();
  });
});
