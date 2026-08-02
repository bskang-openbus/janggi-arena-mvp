import { describe, expect, it } from "vitest";
import { legal, pos, sorted } from "./test-helpers.js";

describe("차 (chariot) — RULES.md 3.1", () => {
  it("V01: e5 on an otherwise empty board sweeps its file and rank (own general blocks, enemy general capturable)", () => {
    const s = pos({ e5: ["cho", "chariot"] }, "cho");
    const dests = legal(s, "e5");
    expect(dests).toEqual(
      sorted([
        // rank 5
        "a5",
        "b5",
        "c5",
        "d5",
        "f5",
        "g5",
        "h5",
        "i5",
        // down the e file: e2 holds the own general -> blocked there
        "e4",
        "e3",
        // up the e file: e9 holds the enemy general -> capture and stop
        "e6",
        "e7",
        "e8",
        "e9",
      ]),
    );
    expect(dests).toHaveLength(14);
    expect(dests).not.toContain("e2");
    expect(dests).not.toContain("e10");
  });

  it("V02: a friendly soldier on e7 stops the upward ray at e6", () => {
    const s = pos({ e5: ["cho", "chariot"], e7: ["cho", "soldier"] }, "cho");
    const dests = legal(s, "e5");
    expect(dests).toContain("e6");
    expect(dests).not.toContain("e7");
    expect(dests).not.toContain("e8");
    expect(dests).toHaveLength(11);
  });

  it("V02b: an enemy soldier on e7 is capturable but the ray stops there", () => {
    const s = pos({ e5: ["cho", "chariot"], e7: ["han", "soldier"] }, "cho");
    const dests = legal(s, "e5");
    expect(dests).toContain("e6");
    expect(dests).toContain("e7");
    expect(dests).not.toContain("e8");
  });

  it("V03: from d3 it rides the palace diagonal d3-e2-f1", () => {
    const s = pos({ d3: ["cho", "chariot"], f2: ["cho", "general"] }, "cho");
    const dests = legal(s, "d3");
    expect(dests).toContain("e2");
    expect(dests).toContain("f1");
    expect(dests).toHaveLength(19);
  });

  it("V03b: d2 carries no diagonal line, so no diagonal destinations exist", () => {
    const s = pos({ d2: ["cho", "chariot"], f2: ["cho", "general"] }, "cho");
    const dests = legal(s, "d2");
    for (const n of ["e1", "e3", "c1", "c3"]) expect(dests, n).not.toContain(n);
  });

  it("V03c: the diagonal ray is blocked like any other ray (piece on e2 stops it)", () => {
    const s = pos({ d3: ["cho", "chariot"], e2: ["cho", "general"] }, "cho");
    expect(legal(s, "d3")).not.toContain("e2");
    expect(legal(s, "d3")).not.toContain("f1");
    const s2 = pos({ d3: ["cho", "chariot"], e2: ["han", "guard"], f2: ["cho", "general"] }, "cho");
    expect(legal(s2, "d3")).toContain("e2");
    expect(legal(s2, "d3")).not.toContain("f1");
  });

  it("V04: a chariot on d10 captures the han general on e9 through the enemy palace diagonal", () => {
    const s = pos({ d10: ["cho", "chariot"] }, "cho");
    expect(legal(s, "d10")).toContain("e9");
  });

  it("V04b: from f10 the diagonal ray runs f10-e9-d8", () => {
    const s = pos({ f10: ["cho", "chariot"], e9: ["han", "general"] }, "cho");
    expect(legal(s, "f10")).toContain("e9");
    expect(legal(s, "f10")).not.toContain("d8"); // e9 (enemy general) stops the ray
    const s2 = pos({ f10: ["cho", "chariot"], e10: ["han", "general"] }, "cho");
    expect(legal(s2, "f10")).toEqual(expect.arrayContaining(["e9", "d8"]));
  });

  it("from the palace centre e2 it can slide to all four corners", () => {
    const s = pos({ e2: ["cho", "chariot"], f1: ["cho", "general"] }, "cho");
    const dests = legal(s, "e2");
    expect(dests).toEqual(expect.arrayContaining(["d1", "d3", "f3"]));
    expect(dests).not.toContain("f1"); // own general
  });

  it("cannot jump over pieces on an orthogonal ray", () => {
    const s = pos(
      { e5: ["cho", "chariot"], c5: ["han", "soldier"], g5: ["cho", "soldier"] },
      "cho",
    );
    const dests = legal(s, "e5");
    expect(dests).toContain("c5");
    expect(dests).not.toContain("b5");
    expect(dests).not.toContain("g5");
    expect(dests).not.toContain("h5");
    expect(dests).toContain("d5");
    expect(dests).toContain("f5");
  });
});
