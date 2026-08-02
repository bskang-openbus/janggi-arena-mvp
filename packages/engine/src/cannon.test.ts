import { describe, expect, it } from "vitest";
import { legal, pos } from "./test-helpers.js";

describe("포 (cannon) — RULES.md 3.2", () => {
  it("V05: with a lone han soldier on b7 as the screen it may land on b8/b9/b10 only", () => {
    const s = pos({ b3: ["cho", "cannon"], b7: ["han", "soldier"] }, "cho");
    expect(legal(s, "b3")).toEqual(["b10", "b8", "b9"]);
  });

  it("V06: no screen anywhere means no move at all", () => {
    const s = pos({ b3: ["cho", "cannon"] }, "cho");
    expect(legal(s, "b3")).toEqual([]);
  });

  it("V07: screen b5 (horse), han soldier b7 -> b6 and b7 only, nothing beyond", () => {
    const s = pos({ b3: ["cho", "cannon"], b5: ["cho", "horse"], b7: ["han", "soldier"] }, "cho");
    expect(legal(s, "b3")).toEqual(["b6", "b7"]);
  });

  it("V08: a cannon may not be used as a screen (han cannon on b5)", () => {
    const s = pos({ b3: ["cho", "cannon"], b5: ["han", "cannon"] }, "cho");
    expect(legal(s, "b3")).toEqual([]);
  });

  it("V08b: a friendly cannon is equally unjumpable", () => {
    const s = pos({ b3: ["cho", "cannon"], b5: ["cho", "cannon"], b7: ["han", "soldier"] }, "cho");
    expect(legal(s, "b3")).toEqual([]);
  });

  it("V09: a cannon cannot capture a cannon (b8 han cannon stays safe)", () => {
    const s = pos({ b3: ["cho", "cannon"], b5: ["cho", "soldier"], b8: ["han", "cannon"] }, "cho");
    expect(legal(s, "b3")).toEqual(["b6", "b7"]);
  });

  it("V10: from the palace corner d1 it fires across the centre screen e2 onto f3", () => {
    const s = pos({ d1: ["cho", "cannon"] }, "cho"); // e2 = cho general (default) is the screen
    expect(legal(s, "d1")).toEqual(["f3"]);
  });

  it("V10b: the palace-diagonal shot can capture, and cannot be made without the centre screen", () => {
    const s = pos({ d1: ["cho", "cannon"], f3: ["han", "guard"] }, "cho");
    expect(legal(s, "d1")).toEqual(["f3"]);
    const noScreen = pos(
      { d1: ["cho", "cannon"], f3: ["han", "guard"], f2: ["cho", "general"] },
      "cho",
    );
    expect(legal(noScreen, "d1")).toEqual([]);
  });

  it("V10c: a cannon on the palace centre has no diagonal shot (no square beyond a corner)", () => {
    const s = pos({ e2: ["cho", "cannon"], d1: ["cho", "guard"], f2: ["cho", "general"] }, "cho");
    expect(legal(s, "e2")).not.toContain("f3");
  });

  it("cannot move a single step without a screen, in any direction", () => {
    const s = pos({ b5: ["cho", "cannon"] }, "cho");
    expect(legal(s, "b5")).toEqual([]);
  });

  it("the generals themselves are valid screens (e5 cannon fires over e2/e9)", () => {
    const s = pos({ e5: ["cho", "cannon"] }, "cho");
    expect(legal(s, "e5")).toEqual(["e1", "e10"]);
  });

  it("jumps horizontally too, and stops at the first piece beyond the screen", () => {
    const s = pos(
      {
        c5: ["cho", "cannon"],
        e5: ["han", "soldier"],
        g5: ["han", "soldier"],
        h5: ["han", "soldier"],
      },
      "cho",
    );
    // screen e5 -> f5 empty, g5 capture, stop before h5
    expect(legal(s, "c5")).toEqual(["f5", "g5"]);
  });
});
