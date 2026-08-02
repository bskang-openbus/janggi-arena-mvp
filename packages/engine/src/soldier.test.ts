import { describe, expect, it } from "vitest";
import { legal, pos, sorted } from "./test-helpers.js";

describe("졸(卒)·병(兵) — RULES.md 3.5", () => {
  it("V16: a cho soldier on e5 moves to e6/d5/f5 and never backwards", () => {
    const s = pos({ e5: ["cho", "soldier"] }, "cho");
    expect(legal(s, "e5")).toEqual(sorted(["e6", "d5", "f5"]));
    expect(legal(s, "e5")).not.toContain("e4");
  });

  it("V17: a han soldier on e5 moves to e4/d5/f5 and never backwards", () => {
    const s = pos({ e5: ["han", "soldier"] }, "han");
    expect(legal(s, "e5")).toEqual(sorted(["e4", "d5", "f5"]));
    expect(legal(s, "e5")).not.toContain("e6");
  });

  it("V18: a cho soldier on the enemy palace centre e9 adds the forward diagonals d10/f10", () => {
    const s = pos({ e9: ["cho", "soldier"], e8: ["han", "general"] }, "cho");
    expect(legal(s, "e9")).toEqual(sorted(["d9", "f9", "e10", "d10", "f10"]));
  });

  it("V19: a cho soldier on d8 may step diagonally forward to e9", () => {
    const s = pos({ d8: ["cho", "soldier"], e9: ["han", "general"] }, "cho");
    const dests = legal(s, "d8");
    expect(dests).toContain("e9"); // diagonal capture of the han general
    expect(dests).toContain("c8");
    expect(dests).toContain("d9");
    expect(dests).toEqual(sorted(["c8", "d9", "e8", "e9"]));
  });

  it("V19b: the palace diagonal is forward-only — a cho soldier on d10 gets no diagonal back to e9", () => {
    const s = pos({ d10: ["cho", "soldier"], e9: ["han", "general"] }, "cho");
    expect(legal(s, "d10")).toEqual(sorted(["c10", "e10"]));
  });

  it("V19c: a han soldier uses the cho palace diagonals in its own forward direction", () => {
    const s = pos({ f3: ["han", "soldier"], e2: ["cho", "general"], d8: ["han", "general"] }, "han");
    const dests = legal(s, "f3");
    expect(dests).toContain("e2"); // diagonal forward capture
    expect(dests).toEqual(sorted(["e2", "e3", "f2", "g3"]));
  });

  it("the soldier's palace diagonal only exists inside the ENEMY palace", () => {
    // cho soldier sitting on its own palace centre e2 -> no diagonal moves
    const s = pos({ e2: ["cho", "soldier"], f1: ["cho", "general"] }, "cho");
    expect(legal(s, "e2")).toEqual(sorted(["d2", "f2", "e3"]));
  });

  it("no promotion on the last rank — sideways only", () => {
    const s = pos({ e10: ["cho", "soldier"] }, "cho");
    expect(legal(s, "e10")).toEqual(sorted(["d10", "f10"]));
  });

  it("captures enemies and is blocked by friends on each of its steps", () => {
    const s = pos(
      { e5: ["cho", "soldier"], e6: ["han", "soldier"], d5: ["cho", "soldier"] },
      "cho",
    );
    const dests = legal(s, "e5");
    expect(dests).toContain("e6");
    expect(dests).not.toContain("d5");
    expect(dests).toContain("f5");
  });
});
