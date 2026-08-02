import { describe, expect, it } from "vitest";
import { EngineError, allLegalActions, applyAction, isFacing, isLegal, toNotation } from "./index.js";
import { move, pass, pos } from "./test-helpers.js";

describe("한수쉼 (pass) — RULES.md 4절", () => {
  it("V28: passing while in check is illegal and throws", () => {
    const s = pos({ e6: ["han", "chariot"] }, "cho");
    expect(isLegal(s, pass)).toBe(false);
    expect(allLegalActions(s).some((a) => a.kind === "pass")).toBe(false);
    expect(() => applyAction(s, pass)).toThrow(EngineError);
  });

  it("V29: passing outside check is legal and only flips the turn", () => {
    const s = pos({ e5: ["cho", "soldier"] }, "cho");
    expect(isLegal(s, pass)).toBe(true);
    const next = applyAction(s, pass);
    expect(next.turn).toBe("han");
    expect(next.result).toBeNull();
    expect(next.history.at(-1)).toMatchObject({ notation: "pass", captured: null, check: false });
    expect(next.board).toEqual(s.board);
  });

  it("both sides may pass in a row", () => {
    const s = pos({ e5: ["cho", "soldier"] }, "cho");
    const s2 = applyAction(applyAction(s, pass), pass);
    expect(s2.turn).toBe("cho");
    expect(s2.history).toHaveLength(2);
  });
});

describe("빅장 (facing generals) — RULES.md 4절", () => {
  it("V27: clearing the e file between the generals draws immediately", () => {
    const s = pos({ e5: ["cho", "soldier"] }, "cho");
    expect(isFacing(s.board)).toBe(false);
    expect(isLegal(s, move("e5", "d5"))).toBe(true); // the move itself is legal
    const next = applyAction(s, move("e5", "d5"));
    expect(isFacing(next.board)).toBe(true);
    expect(next.result).toEqual({ type: "draw", reason: "facing" });
  });

  it("V27b: no draw while any piece stands between the generals", () => {
    const s = pos({ e5: ["cho", "soldier"] }, "cho");
    const next = applyAction(s, move("e5", "e6"));
    expect(isFacing(next.board)).toBe(false);
    expect(next.result).toBeNull();
  });

  it("V27c: generals on different files never face each other", () => {
    const s = pos({ d9: ["han", "general"], e2: ["cho", "general"] }, "cho");
    expect(isFacing(s.board)).toBe(false);
  });

  it("V27d: a finished game refuses further actions", () => {
    const s = pos({ e5: ["cho", "soldier"] }, "cho");
    const drawn = applyAction(s, move("e5", "d5"));
    expect(allLegalActions(drawn)).toEqual([]);
    expect(() => applyAction(drawn, pass)).toThrow(EngineError);
  });
});

describe("반복 무승부 (3-fold repetition) — RULES.md 4절", () => {
  it("V30: four consecutive passes reach the same position for the 3rd time", () => {
    let s = pos({ e5: ["cho", "soldier"] }, "cho");
    s = applyAction(s, pass); // han to move (1st)
    expect(s.result).toBeNull();
    s = applyAction(s, pass); // cho to move (2nd occurrence)
    expect(s.result).toBeNull();
    s = applyAction(s, pass); // han to move (2nd)
    expect(s.result).toBeNull();
    s = applyAction(s, pass); // cho to move (3rd occurrence) -> draw
    expect(s.result).toEqual({ type: "draw", reason: "repetition" });
  });

  it("V30b: shuffling chariots back and forth also triggers the repetition draw", () => {
    let s = pos({ a1: ["cho", "chariot"], i10: ["han", "chariot"], e5: ["cho", "soldier"] }, "cho");
    const cycle = [
      move("a1", "a2"),
      move("i10", "i9"),
      move("a2", "a1"),
      move("i9", "i10"),
    ] as const;
    for (let i = 0; i < 4; i++) {
      s = applyAction(s, cycle[i]!);
      expect(s.result, `ply ${i + 1}`).toBeNull();
    }
    for (let i = 0; i < 3; i++) {
      s = applyAction(s, cycle[i]!);
      expect(s.result, `ply ${i + 5}`).toBeNull();
    }
    s = applyAction(s, cycle[3]!);
    expect(s.result).toEqual({ type: "draw", reason: "repetition" });
    expect(s.history).toHaveLength(8);
  });

  it("V30c: the same layout with the other side to move is a different position", () => {
    const s = pos({ a1: ["cho", "chariot"], e5: ["cho", "soldier"] }, "cho");
    const afterPass = applyAction(s, pass);
    const keys = [...afterPass.positionCounts.keys()];
    expect(keys).toHaveLength(2); // layout|cho and layout|han
    expect(afterPass.positionCounts.get(keys[0]!)).toBe(1);
  });
});

describe("엔진 계약 잡다 (docs/ENGINE_API.md)", () => {
  it("records notation as from+to and keeps history append-only", () => {
    const s = pos({ a1: ["cho", "chariot"], e5: ["cho", "soldier"] }, "cho");
    const s1 = applyAction(s, move("a1", "a2"));
    const s2 = applyAction(s1, pass);
    expect(s1.history.map((h) => h.notation)).toEqual(["a1a2"]);
    expect(s2.history.map((h) => h.notation)).toEqual(["a1a2", "pass"]);
    expect(s.history).toHaveLength(0);
  });

  it("flags check on the applied action when the move gives check", () => {
    const s = pos({ e6: ["han", "chariot"], e5: ["cho", "soldier"] }, "han");
    const next = applyAction(s, move("e6", "e5"));
    expect(next.history.at(-1)!.check).toBe(true);
    expect(next.history.at(-1)!.captured).toMatchObject({ type: "soldier", side: "cho" });
  });

  it("exposes every legal action of the initial position (moves + pass)", () => {
    const s = pos({ a1: ["cho", "chariot"], e5: ["cho", "soldier"] }, "cho");
    const actions = allLegalActions(s);
    const passes = actions.filter((a) => a.kind === "pass");
    expect(passes).toHaveLength(1);
    for (const a of actions) {
      if (a.kind === "move") expect(toNotation(a.move.from)).toBeTruthy();
    }
  });
});
