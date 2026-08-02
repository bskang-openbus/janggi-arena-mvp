import { describe, expect, it } from "vitest";
import {
  ENGINE_NAME,
  EngineError,
  FILES,
  RANKS,
  findGeneral,
  forEachPiece,
  inPalaceOf,
  initialState,
  isPalaceDiagonalPoint,
  palaceDiagonalNeighbors,
  parseNotation,
  pieceAt,
  toNotation,
} from "./index.js";
import { sorted } from "./test-helpers.js";

describe("board / coordinates (RULES.md 1절)", () => {
  it("is a 9 files x 10 ranks grid", () => {
    expect(FILES).toBe(9);
    expect(RANKS).toBe(10);
    expect(ENGINE_NAME).toBe("janggi-engine");
  });

  it("round-trips notation both ways", () => {
    expect(toNotation({ file: 4, rank: 1 })).toBe("e2");
    expect(parseNotation("e2")).toEqual({ file: 4, rank: 1 });
    expect(toNotation({ file: 0, rank: 0 })).toBe("a1");
    expect(toNotation({ file: 8, rank: 9 })).toBe("i10");
    expect(parseNotation("i10")).toEqual({ file: 8, rank: 9 });
    for (const n of ["a1", "e5", "i10", "d8", "f3"]) {
      expect(toNotation(parseNotation(n))).toBe(n);
    }
  });

  it("rejects malformed or out-of-board notation", () => {
    expect(() => parseNotation("j1")).toThrow(EngineError);
    expect(() => parseNotation("e0")).toThrow(EngineError);
    expect(() => parseNotation("e11")).toThrow(EngineError);
    expect(() => toNotation({ file: 9, rank: 0 })).toThrow(EngineError);
  });

  it("locates both palaces (cho d1-f3, han d8-f10)", () => {
    expect(inPalaceOf(parseNotation("e2"), "cho")).toBe(true);
    expect(inPalaceOf(parseNotation("d1"), "cho")).toBe(true);
    expect(inPalaceOf(parseNotation("f3"), "cho")).toBe(true);
    expect(inPalaceOf(parseNotation("c1"), "cho")).toBe(false);
    expect(inPalaceOf(parseNotation("e4"), "cho")).toBe(false);
    expect(inPalaceOf(parseNotation("e9"), "han")).toBe(true);
    expect(inPalaceOf(parseNotation("f10"), "han")).toBe(true);
    expect(inPalaceOf(parseNotation("e7"), "han")).toBe(false);
  });

  it("marks only the X points (4 corners + centre) as diagonal points", () => {
    for (const n of ["d1", "f1", "e2", "d3", "f3", "d8", "f8", "e9", "d10", "f10"]) {
      expect(isPalaceDiagonalPoint(parseNotation(n)), n).toBe(true);
    }
    for (const n of ["d2", "e1", "e3", "f2", "e8", "e10", "d9", "f9", "e5"]) {
      expect(isPalaceDiagonalPoint(parseNotation(n)), n).toBe(false);
    }
  });

  it("links palace diagonals as d1-e2-f3 / f1-e2-d3 (RULES.md 1절)", () => {
    expect(sorted(palaceDiagonalNeighbors(parseNotation("e2")).map(toNotation))).toEqual([
      "d1",
      "d3",
      "f1",
      "f3",
    ]);
    expect(palaceDiagonalNeighbors(parseNotation("d1")).map(toNotation)).toEqual(["e2"]);
    expect(palaceDiagonalNeighbors(parseNotation("f3")).map(toNotation)).toEqual(["e2"]);
    expect(sorted(palaceDiagonalNeighbors(parseNotation("e9")).map(toNotation))).toEqual([
      "d10",
      "d8",
      "f10",
      "f8",
    ]);
    expect(palaceDiagonalNeighbors(parseNotation("d2"))).toEqual([]);
  });
});

describe("initial setup (RULES.md 2절, 마상상마 고정)", () => {
  const s = initialState();

  it("places 32 pieces, 16 per side, cho to move", () => {
    let cho = 0;
    let han = 0;
    forEachPiece(s.board, (p) => (p.side === "cho" ? cho++ : han++));
    expect(cho).toBe(16);
    expect(han).toBe(16);
    expect(s.turn).toBe("cho");
    expect(s.result).toBeNull();
    expect(s.history).toHaveLength(0);
  });

  it("matches the documented 마상상마 layout exactly", () => {
    const expected: Record<string, string> = {
      a10: "han/chariot",
      b10: "han/horse",
      c10: "han/elephant",
      d10: "han/guard",
      f10: "han/guard",
      g10: "han/elephant",
      h10: "han/horse",
      i10: "han/chariot",
      e9: "han/general",
      b8: "han/cannon",
      h8: "han/cannon",
      a7: "han/soldier",
      c7: "han/soldier",
      e7: "han/soldier",
      g7: "han/soldier",
      i7: "han/soldier",
      a4: "cho/soldier",
      c4: "cho/soldier",
      e4: "cho/soldier",
      g4: "cho/soldier",
      i4: "cho/soldier",
      b3: "cho/cannon",
      h3: "cho/cannon",
      e2: "cho/general",
      a1: "cho/chariot",
      b1: "cho/horse",
      c1: "cho/elephant",
      d1: "cho/guard",
      f1: "cho/guard",
      g1: "cho/elephant",
      h1: "cho/horse",
      i1: "cho/chariot",
    };
    for (const [at, want] of Object.entries(expected)) {
      const p = pieceAt(s.board, parseNotation(at));
      expect(p ? `${p.side}/${p.type}` : null, at).toBe(want);
    }
    // e10 / e1 / e5 must be empty
    for (const at of ["e10", "e1", "e5", "b5", "d9"]) {
      expect(pieceAt(s.board, parseNotation(at)), at).toBeNull();
    }
  });

  it("gives every piece a unique id and finds both generals", () => {
    const ids = new Set<string>();
    forEachPiece(s.board, (p) => ids.add(p.id));
    expect(ids.size).toBe(32);
    expect(toNotation(findGeneral(s.board, "cho")!)).toBe("e2");
    expect(toNotation(findGeneral(s.board, "han")!)).toBe("e9");
  });

  it("returns a fresh board on every call (pure factory)", () => {
    const a = initialState();
    const b = initialState();
    expect(a.board).not.toBe(b.board);
    a.board[4]![4] = null;
    expect(pieceAt(b.board, parseNotation("e2"))).not.toBeNull();
  });
});
