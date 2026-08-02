import { describe, expect, it } from "vitest";
import { EngineError, allLegalActions, applyAction, isCheck, isCheckmate, isLegal } from "./index.js";
import { legal, move, pass, pos, sorted } from "./test-helpers.js";

describe("장군 / 자살수 / 외통 — RULES.md 4절", () => {
  it("V23: a han chariot on e6 puts the cho general on e2 in check", () => {
    const s = pos({ e6: ["han", "chariot"] }, "cho");
    expect(isCheck(s, "cho")).toBe(true);
    expect(isCheck(s, "han")).toBe(false);
  });

  it("V23b: a blocker between them cancels the check", () => {
    const s = pos({ e6: ["han", "chariot"], e4: ["cho", "soldier"] }, "cho");
    expect(isCheck(s, "cho")).toBe(false);
  });

  it("V24: while in check only check-escaping actions are generated (and never a pass)", () => {
    const s = pos({ e6: ["han", "chariot"] }, "cho");
    const actions = allLegalActions(s);
    expect(actions.every((a) => a.kind === "move")).toBe(true);
    expect(legal(s, "e2")).toEqual(sorted(["d1", "d2", "d3", "f1", "f2", "f3"]));
    expect(actions).toHaveLength(6);
    expect(isLegal(s, pass)).toBe(false);
  });

  it("V25: a guard shielding the general may not step aside (자살수)", () => {
    const s = pos({ e3: ["cho", "guard"], e6: ["han", "chariot"] }, "cho");
    expect(isCheck(s, "cho")).toBe(false);
    const dests = legal(s, "e3");
    expect(dests).not.toContain("d3");
    expect(dests).not.toContain("f3");
    // e3 has no diagonal and e4 is outside the palace, so the pinned guard is frozen entirely
    expect(dests).toEqual([]);
    expect(isLegal(s, move("e3", "d3"))).toBe(false);
    expect(() => applyAction(s, move("e3", "d3"))).toThrow(EngineError);
  });

  it("V25b: capturing the checking piece and blocking the line are both legal escapes", () => {
    const s = pos({ e6: ["han", "chariot"], a6: ["cho", "chariot"], d3: ["cho", "horse"] }, "cho");
    expect(isCheck(s, "cho")).toBe(true);
    expect(legal(s, "a6")).toEqual(["e6"]); // capture the checker
    expect(legal(s, "d3")).toEqual(["e5"]); // interpose on the e file
  });

  it("V26: designed mating position is checkmate for cho", () => {
    const s = pos(
      {
        e1: ["cho", "general"],
        a1: ["han", "chariot"],
        a2: ["han", "chariot"],
        d8: ["han", "general"],
      },
      "cho",
    );
    expect(isCheck(s, "cho")).toBe(true);
    expect(allLegalActions(s)).toHaveLength(0);
    expect(isCheckmate(s)).toBe(true);
  });

  it("V26b: applyAction reports the mating move as result checkmate/han", () => {
    const s = pos(
      {
        e1: ["cho", "general"],
        c5: ["han", "chariot"],
        b2: ["han", "chariot"],
        d8: ["han", "general"],
      },
      "han",
    );
    expect(isCheck(s, "cho")).toBe(false);
    const next = applyAction(s, move("c5", "c1"));
    expect(next.result).toEqual({ type: "checkmate", winner: "han" });
    expect(next.history.at(-1)!.check).toBe(true);
    expect(next.history.at(-1)!.notation).toBe("c5c1");
    expect(() => applyAction(next, pass)).toThrow(EngineError);
  });

  it("V26c: a check with an escape is not checkmate", () => {
    const s = pos({ e1: ["cho", "general"], a1: ["han", "chariot"], d8: ["han", "general"] }, "cho");
    expect(isCheck(s, "cho")).toBe(true);
    expect(isCheckmate(s)).toBe(false);
    expect(legal(s, "e1")).toEqual(["e2"]);
  });

  it("no stalemate: with zero moves but no check the only action is a pass", () => {
    // cho's palace is completely packed with its own pieces -> not a single move exists
    const s = pos(
      {
        e1: ["cho", "general"],
        d1: ["cho", "guard"],
        f1: ["cho", "guard"],
        d2: ["cho", "guard"],
        e2: ["cho", "guard"],
        f2: ["cho", "guard"],
        d3: ["cho", "guard"],
        e3: ["cho", "guard"],
        f3: ["cho", "guard"],
        d8: ["han", "general"],
      },
      "cho",
    );
    expect(isCheck(s, "cho")).toBe(false);
    expect(allLegalActions(s)).toEqual([{ kind: "pass" }]);
    expect(isCheckmate(s)).toBe(false);
  });

  it("applyAction records captures with the captured piece", () => {
    const s = pos({ e6: ["cho", "chariot"], e7: ["han", "soldier"] }, "cho");
    const next = applyAction(s, move("e6", "e7"));
    const last = next.history.at(-1)!;
    expect(last.captured).toMatchObject({ side: "han", type: "soldier" });
    expect(next.turn).toBe("han");
    expect(next.board[5]![4]).toBeNull();
  });

  it("applyAction is pure: the source state is untouched", () => {
    const s = pos({ e6: ["cho", "chariot"], e7: ["han", "soldier"] }, "cho");
    const before = JSON.stringify(s.board);
    applyAction(s, move("e6", "e7"));
    expect(JSON.stringify(s.board)).toBe(before);
    expect(s.history).toHaveLength(0);
    expect(s.turn).toBe("cho");
  });

  it("moving an opponent piece or an empty square is illegal", () => {
    const s = pos({ e6: ["han", "chariot"] }, "cho");
    expect(legal(s, "e6")).toEqual([]);
    expect(isLegal(s, move("e6", "e5"))).toBe(false);
    expect(isLegal(s, move("a5", "a6"))).toBe(false);
    expect(() => applyAction(s, move("a5", "a6"))).toThrow(EngineError);
  });
});
