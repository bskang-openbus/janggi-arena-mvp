import { describe, expect, it } from "vitest";
import { legal, pos, sorted } from "./test-helpers.js";

describe("사(士)·궁(將) — RULES.md 3.6 / 3.7", () => {
  it("V20: a guard on d2 has 3 destinations (no diagonal line on d2)", () => {
    const s = pos({ d2: ["cho", "guard"], f1: ["cho", "general"] }, "cho");
    expect(legal(s, "d2")).toEqual(sorted(["d1", "d3", "e2"]));
  });

  it("V21: the general on the palace centre e2 reaches all 8 neighbouring points", () => {
    const s = pos({ e2: ["cho", "general"] }, "cho");
    expect(legal(s, "e2")).toEqual(sorted(["d1", "e1", "f1", "d2", "f2", "d3", "e3", "f3"]));
  });

  it("V22: moving a guard off e2 is fine while the general sits on d1 (no exposure)", () => {
    const s = pos({ d1: ["cho", "general"], e2: ["cho", "guard"], e6: ["han", "chariot"] }, "cho");
    expect(legal(s, "e2")).toEqual(sorted(["e1", "d2", "f2", "e3", "f1", "d3", "f3"]));
  });

  it("neither general nor guard may leave the palace", () => {
    const g = pos({ d2: ["cho", "guard"], f1: ["cho", "general"] }, "cho");
    expect(legal(g, "d2")).not.toContain("c2");
    const k = pos({ e3: ["cho", "general"] }, "cho");
    expect(legal(k, "e3")).toEqual(sorted(["d3", "f3", "e2"]));
    expect(legal(k, "e3")).not.toContain("e4");
  });

  it("a corner guard on d1 has exactly d2, e1 and the diagonal e2", () => {
    const s = pos({ d1: ["cho", "guard"], f3: ["cho", "general"] }, "cho");
    expect(legal(s, "d1")).toEqual(sorted(["d2", "e1", "e2"]));
  });

  it("the han general uses its own palace lines (e9 centre = 8 points)", () => {
    const s = pos({ e9: ["han", "general"] }, "han");
    expect(legal(s, "e9")).toEqual(sorted(["d8", "e8", "f8", "d9", "f9", "d10", "e10", "f10"]));
  });

  it("captures enemy pieces inside the palace and is blocked by friends", () => {
    const s = pos(
      { e2: ["cho", "general"], d1: ["han", "soldier"], f1: ["cho", "guard"] },
      "cho",
    );
    const dests = legal(s, "e2");
    expect(dests).toContain("d1");
    expect(dests).not.toContain("f1");
  });

  it("the general may not step onto an attacked square (자살수)", () => {
    // han chariot on d6 rakes the whole d file
    const s = pos({ e2: ["cho", "general"], d6: ["han", "chariot"] }, "cho");
    const dests = legal(s, "e2");
    expect(dests).not.toContain("d1");
    expect(dests).not.toContain("d2");
    expect(dests).not.toContain("d3");
    expect(dests).toEqual(sorted(["e1", "e3", "f1", "f2", "f3"]));
  });
});
