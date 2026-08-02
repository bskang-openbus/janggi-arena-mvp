import { describe, expect, it } from "vitest";
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type RandomIndex,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from "./room-code.js";

/** Deterministic index source: replays `values` in order, then wraps. */
function sequence(values: number[]): RandomIndex {
  let i = 0;
  return () => values[i++ % values.length] as number;
}

describe("room codes", () => {
  it("are 6 characters from the unambiguous alphanumeric alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode(() => false);
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(isValidRoomCode(code)).toBe(true);
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  it("drops the characters people confuse when reading a code aloud", () => {
    for (const ch of ["0", "O", "1", "I", "L"]) {
      expect(ROOM_CODE_ALPHABET).not.toContain(ch);
    }
  });

  it("retries until it finds a code that is not taken", () => {
    const taken = new Set(["AAAAAA"]);
    const random = sequence([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
    expect(generateRoomCode((code) => taken.has(code), random)).toBe("BBBBBB");
  });

  it("gives up instead of handing out a duplicate", () => {
    expect(() => generateRoomCode(() => true, sequence([0]))).toThrow(/free room code/);
  });

  it("never repeats a code inside one registry", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode((c) => taken.has(c));
      expect(taken.has(code)).toBe(false);
      taken.add(code);
    }
    expect(taken.size).toBe(500);
  });

  it("normalizes what a user types", () => {
    expect(normalizeRoomCode(" ab-c d2 ")).toBe("ABCD2");
    expect(isValidRoomCode("ABC")).toBe(false);
    expect(isValidRoomCode("ABCDE0")).toBe(false); // 0 is not in the alphabet
    expect(isValidRoomCode("ABCDE2")).toBe(true);
  });
});
