import { describe, expect, it } from "vitest";
import { allLegalActions, applyAction, initialState, perft, toNotation } from "./index.js";

describe("perft 자가 검증 (TASKS.md P1)", () => {
  const s0 = initialState();

  it("depth 1: 31 moves + 한수쉼 = 32 actions", () => {
    const actions = allLegalActions(s0);
    expect(actions.filter((a) => a.kind === "move")).toHaveLength(31);
    expect(actions.filter((a) => a.kind === "pass")).toHaveLength(1);
    expect(perft(s0, 1)).toBe(32);
  });

  it("depth 1 breakdown matches a hand count of the 마상상마 setup", () => {
    const byOrigin = new Map<string, number>();
    for (const a of allLegalActions(s0)) {
      if (a.kind !== "move") continue;
      const key = toNotation(a.move.from);
      byOrigin.set(key, (byOrigin.get(key) ?? 0) + 1);
    }
    expect(Object.fromEntries([...byOrigin].sort())).toEqual({
      a1: 2, // chariot up to a3 (own soldier on a4)
      a4: 2, // soldier: a5, b4
      b1: 2, // horse: a3, c3
      c4: 3,
      d1: 2, // guard: d2, e1
      e2: 6, // general: 8 palace lines minus the two guards
      e4: 3,
      f1: 2,
      g4: 3,
      h1: 2,
      i1: 2,
      i4: 2,
    });
    // 포는 초기 국면에서 움직일 수 없다 (아래는 판 밖, 위는 상대 포가 포다리)
    expect(byOrigin.get("b3")).toBeUndefined();
    expect(byOrigin.get("h3")).toBeUndefined();
    // 상도 자기 졸/포/마에 막혀 0
    expect(byOrigin.get("c1")).toBeUndefined();
    expect(byOrigin.get("g1")).toBeUndefined();
  });

  it("depth 2 completes without a single exception (32 x 32 = 1024)", () => {
    expect(perft(s0, 2)).toBe(1024);
  });

  it("every depth-2 continuation is itself replayable", () => {
    let checked = 0;
    for (const a of allLegalActions(s0)) {
      const s1 = applyAction(s0, a);
      expect(s1.result).toBeNull();
      for (const b of allLegalActions(s1)) {
        expect(() => applyAction(s1, b)).not.toThrow();
        checked++;
      }
    }
    expect(checked).toBe(1024);
  });

  it("perft(depth 0) is 1 and a terminal position yields 0", () => {
    expect(perft(s0, 0)).toBe(1);
  });
});
