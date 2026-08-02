import { describe, expect, it } from "vitest";
import { legal, pos, sorted } from "./test-helpers.js";

const HORSE_E5 = sorted(["c4", "c6", "d3", "d7", "f3", "f7", "g4", "g6"]);
const ELEPHANT_E5 = sorted(["b3", "b7", "c2", "c8", "g2", "g8", "h3", "h7"]);

describe("마 (horse) — RULES.md 3.3", () => {
  it("V11: e5 on an empty board reaches all 8 squares", () => {
    const s = pos({ e5: ["cho", "horse"] }, "cho");
    expect(legal(s, "e5")).toEqual(HORSE_E5);
  });

  it("V12: a piece on the leg square e6 removes d7 and f7 (멱)", () => {
    const s = pos({ e5: ["cho", "horse"], e6: ["han", "soldier"] }, "cho");
    const dests = legal(s, "e5");
    expect(dests).not.toContain("d7");
    expect(dests).not.toContain("f7");
    expect(dests).toHaveLength(6);
  });

  it("V12b: a friendly leg blocks exactly the same way", () => {
    const s = pos({ e5: ["cho", "horse"], d5: ["cho", "soldier"] }, "cho");
    const dests = legal(s, "e5");
    expect(dests).not.toContain("c4");
    expect(dests).not.toContain("c6");
    expect(dests).toHaveLength(6);
  });

  it("a piece on the destination is captured (enemy) or blocks (friend)", () => {
    const enemy = pos({ e5: ["cho", "horse"], f7: ["han", "soldier"] }, "cho");
    expect(legal(enemy, "e5")).toContain("f7");
    const friend = pos({ e5: ["cho", "horse"], f7: ["cho", "soldier"] }, "cho");
    expect(legal(friend, "e5")).not.toContain("f7");
  });

  it("is clipped by the board edge (a1 corner horse has 2 moves)", () => {
    const s = pos({ a1: ["cho", "horse"], f2: ["cho", "general"] }, "cho");
    expect(legal(s, "a1")).toEqual(["b3", "c2"]);
  });
});

describe("상 (elephant) — RULES.md 3.4", () => {
  it("V13: e5 on an empty board reaches the 8 (±2,±3)/(±3,±2) squares", () => {
    const s = pos({ e5: ["cho", "elephant"] }, "cho");
    expect(legal(s, "e5")).toEqual(ELEPHANT_E5);
  });

  it("V14: a piece on the first diagonal step f7 kills only the g8 path (멱 2)", () => {
    const s = pos({ e5: ["cho", "elephant"], f7: ["han", "soldier"] }, "cho");
    const dests = legal(s, "e5");
    expect(dests).not.toContain("g8");
    expect(dests).toContain("c8");
    expect(dests).toContain("h7");
    expect(dests).toHaveLength(7);
  });

  it("V14b: f6 lies on no elephant path from e5, so it blocks nothing (RULES.md 3.4 geometry)", () => {
    const s = pos({ e5: ["cho", "elephant"], f6: ["han", "soldier"] }, "cho");
    expect(legal(s, "e5")).toEqual(ELEPHANT_E5);
  });

  it("V15: a piece on the straight leg e6 kills both upward paths (c8, g8)", () => {
    const s = pos({ e5: ["cho", "elephant"], e6: ["han", "soldier"] }, "cho");
    const dests = legal(s, "e5");
    expect(dests).not.toContain("c8");
    expect(dests).not.toContain("g8");
    expect(dests).toHaveLength(6);
  });

  it("V15b: the second 멱 blocks even when the destination is free", () => {
    const s = pos({ e5: ["cho", "elephant"], g6: ["cho", "soldier"] }, "cho");
    const dests = legal(s, "e5");
    expect(dests).not.toContain("h7");
    expect(dests).toContain("h3");
    expect(dests).toHaveLength(7);
  });

  it("captures enemies on its landing square and is blocked by friends", () => {
    const enemy = pos({ e5: ["cho", "elephant"], g8: ["han", "chariot"] }, "cho");
    expect(legal(enemy, "e5")).toContain("g8");
    const friend = pos({ e5: ["cho", "elephant"], g8: ["cho", "chariot"] }, "cho");
    expect(legal(friend, "e5")).not.toContain("g8");
  });

  it("is clipped by the board edge (c1 elephant keeps only on-board landings)", () => {
    const s = pos({ c1: ["cho", "elephant"], f2: ["cho", "general"] }, "cho");
    expect(legal(s, "c1")).toEqual(sorted(["a4", "e4", "f3"]));
  });
});
