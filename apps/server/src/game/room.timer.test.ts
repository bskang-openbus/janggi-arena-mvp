import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "../engine.js";
import type { RoomEventKind } from "./room.js";
import { pos, sq } from "../testing/positions.js";
import { Room } from "./room.js";

const CHO = "socket-cho";
const HAN = "socket-han";
const TURN_MS = 60_000;

function seatedRoom(initialGameState?: GameState): { room: Room; events: RoomEventKind[] } {
  const events: RoomEventKind[] = [];
  const room = new Room({
    code: "CLOCK1",
    turnTimeoutMs: TURN_MS,
    autoPassLimit: 2,
    listener: (_room, kind) => events.push(kind),
    ...(initialGameState ? { initialGameState } : {}),
  });
  room.join(CHO, "초보");
  room.join(HAN, "한량");
  return { room, events };
}

describe("Room — turn clock (60s)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("publishes a deadline one turn ahead", () => {
    const { room } = seatedRoom();
    const snap = room.snapshot();
    expect(snap.turnTimeoutMs).toBe(TURN_MS);
    expect(snap.turnDeadline).toBe(snap.serverTime + TURN_MS);
    room.dispose();
  });

  it("does nothing before the clock runs out", () => {
    const { room } = seatedRoom();
    vi.advanceTimersByTime(TURN_MS - 1);
    expect(room.snapshot().ply).toBe(0);
    expect(room.snapshot().turn).toBe("cho");
    room.dispose();
  });

  it("auto-passes for the player whose clock expires", () => {
    const { room, events } = seatedRoom();
    vi.advanceTimersByTime(TURN_MS);

    const snap = room.snapshot();
    expect(snap.turn).toBe("han");
    expect(snap.ply).toBe(1);
    expect(snap.lastAction).toMatchObject({ side: "cho", notation: "pass", auto: true });
    expect(snap.autoPassCount).toEqual({ cho: 1, han: 0 });
    expect(room.roomStatus).toBe("playing");
    expect(events.at(-1)).toBe("state");
    room.dispose();
  });

  it("restarts the clock after every accepted action", () => {
    const { room } = seatedRoom();
    vi.advanceTimersByTime(TURN_MS - 1_000);
    room.submitMove(CHO, sq("a4"), sq("a5")); // 초 moves just in time

    vi.advanceTimersByTime(TURN_MS - 1_000); // 한 still has a second left
    expect(room.snapshot().autoPassCount).toEqual({ cho: 0, han: 0 });

    vi.advanceTimersByTime(1_000);
    expect(room.snapshot().autoPassCount).toEqual({ cho: 0, han: 1 });
    room.dispose();
  });

  it("forfeits the game on the second auto pass of the same side", () => {
    const { room, events } = seatedRoom();

    vi.advanceTimersByTime(TURN_MS); // 초 auto pass #1
    expect(room.snapshot().autoPassCount.cho).toBe(1);

    room.submitMove(HAN, sq("a7"), sq("a6")); // 한 answers, clock is 초's again

    vi.advanceTimersByTime(TURN_MS); // 초 auto pass #2 -> defeat
    expect(room.snapshot().autoPassCount.cho).toBe(2);
    expect(room.result).toEqual({
      type: "forfeit",
      winner: "han",
      loser: "cho",
      reason: "auto_pass_limit",
    });
    expect(room.roomStatus).toBe("finished");
    expect(room.snapshot().turnDeadline).toBeNull();
    expect(events.at(-1)).toBe("over");
    room.dispose();
  });

  it("counts auto passes per side", () => {
    const { room } = seatedRoom();
    vi.advanceTimersByTime(TURN_MS); // 초 #1
    vi.advanceTimersByTime(TURN_MS); // 한 #1
    expect(room.snapshot().autoPassCount).toEqual({ cho: 1, han: 1 });
    expect(room.roomStatus).toBe("playing");

    vi.advanceTimersByTime(TURN_MS); // 초 #2 -> 초 loses
    expect(room.result).toMatchObject({ type: "forfeit", loser: "cho" });
    room.dispose();
  });

  it("loses immediately when the clock expires while in check (한수쉼 is illegal)", () => {
    const { room, events } = seatedRoom(
      pos({ e1: ["cho", "general"], a1: ["han", "chariot"], d8: ["han", "general"] }, "cho"),
    );
    expect(room.snapshot().check).toBe(true);

    vi.advanceTimersByTime(TURN_MS);

    expect(room.result).toEqual({ type: "timeout", winner: "han", loser: "cho" });
    expect(room.snapshot().autoPassCount.cho).toBe(0);
    expect(room.snapshot().ply).toBe(0);
    expect(events.at(-1)).toBe("over");
    room.dispose();
  });

  it("stops the clock once the game is over", () => {
    const { room } = seatedRoom();
    room.resign(CHO);
    const before = room.snapshot();

    vi.advanceTimersByTime(TURN_MS * 5);

    expect(room.snapshot()).toMatchObject({ ply: before.ply, turnDeadline: null });
    expect(room.result).toEqual({ type: "resign", winner: "han", loser: "cho" });
    room.dispose();
  });

  it("keeps ticking for a disconnected player until they forfeit", () => {
    const { room } = seatedRoom();
    room.markDisconnected(CHO);

    vi.advanceTimersByTime(TURN_MS); // 초 auto pass #1
    room.submitMove(HAN, sq("a7"), sq("a6"));
    vi.advanceTimersByTime(TURN_MS); // 초 auto pass #2 -> 한 wins

    expect(room.result).toMatchObject({ type: "forfeit", winner: "han", loser: "cho" });
    room.dispose();
  });

  it("does not fire after dispose", () => {
    const { room, events } = seatedRoom();
    room.dispose();
    const count = events.length;
    vi.advanceTimersByTime(TURN_MS * 3);
    expect(events).toHaveLength(count);
  });
});
