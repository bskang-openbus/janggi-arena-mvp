import { describe, expect, it } from "vitest";
import { applyAction, isCheck, pieceAt, parseNotation } from "./index.js";
import { move, pos } from "./test-helpers.js";

describe("장군 판정 — 기물별 공격 (자체 경계 케이스)", () => {
  it("chariot checks along a file", () => {
    expect(isCheck(pos({ e6: ["han", "chariot"] }, "cho"), "cho")).toBe(true);
  });

  it("chariot checks through the palace diagonal", () => {
    // han chariot on d3 rides d3-e2 and hits the cho general
    expect(isCheck(pos({ d3: ["han", "chariot"] }, "cho"), "cho")).toBe(true);
  });

  it("cannon checks over exactly one screen", () => {
    expect(isCheck(pos({ e6: ["han", "cannon"], e4: ["cho", "soldier"] }, "cho"), "cho")).toBe(true);
    expect(isCheck(pos({ e6: ["han", "cannon"] }, "cho"), "cho")).toBe(false);
    // two screens -> no check
    expect(
      isCheck(pos({ e6: ["han", "cannon"], e5: ["cho", "soldier"], e4: ["cho", "soldier"] }, "cho"), "cho"),
    ).toBe(false);
  });

  it("cannon cannot use another cannon as its screen for a check", () => {
    expect(isCheck(pos({ e6: ["han", "cannon"], e4: ["cho", "cannon"] }, "cho"), "cho")).toBe(false);
  });

  it("horse checks, and a 멱 cancels it", () => {
    // han horse on d4 -> e2 (leg e4 / d3 dependent)
    expect(isCheck(pos({ d4: ["han", "horse"] }, "cho"), "cho")).toBe(true);
    expect(isCheck(pos({ d4: ["han", "horse"], d3: ["cho", "soldier"] }, "cho"), "cho")).toBe(false);
  });

  it("elephant checks from (±2,±3), and either 멱 cancels it", () => {
    // e2 - 3 ranks up and 2 files across = c5 / g5
    expect(isCheck(pos({ g5: ["han", "elephant"] }, "cho"), "cho")).toBe(true);
    expect(isCheck(pos({ g5: ["han", "elephant"], g4: ["cho", "soldier"] }, "cho"), "cho")).toBe(false);
    expect(isCheck(pos({ g5: ["han", "elephant"], f3: ["cho", "soldier"] }, "cho"), "cho")).toBe(false);
  });

  it("soldier checks straight ahead and along the enemy palace diagonal", () => {
    expect(isCheck(pos({ e3: ["han", "soldier"] }, "cho"), "cho")).toBe(true);
    expect(isCheck(pos({ d3: ["han", "soldier"] }, "cho"), "cho")).toBe(true); // d3 -> e2 diagonal
    expect(isCheck(pos({ d1: ["han", "soldier"] }, "cho"), "cho")).toBe(false); // backwards diagonal
  });

  it("guard and general only ever attack inside their own palace", () => {
    expect(isCheck(pos({ e3: ["han", "guard"], e9: ["han", "general"] }, "cho"), "cho")).toBe(false);
    // a han guard cannot even stand in the cho palace legally; the check must come from elsewhere
    expect(isCheck(pos({ d8: ["cho", "soldier"], e9: ["han", "general"] }, "han"), "han")).toBe(true);
  });

  it("the two generals do not attack each other (빅장은 무승부, 장군 아님)", () => {
    const facing = pos({}, "cho"); // e2 / e9 with an empty e file
    expect(isCheck(facing, "cho")).toBe(false);
    expect(isCheck(facing, "han")).toBe(false);
  });

  it("piece identity survives a move (연출 추적용 id)", () => {
    const s = pos({ e6: ["cho", "chariot"], e7: ["han", "soldier"] }, "cho");
    const before = pieceAt(s.board, parseNotation("e6"))!;
    const next = applyAction(s, move("e6", "e7"));
    expect(pieceAt(next.board, parseNotation("e7"))!.id).toBe(before.id);
    expect(next.history.at(-1)!.captured!.id).toContain("han-soldier");
  });
});
