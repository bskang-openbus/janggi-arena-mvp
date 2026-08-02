import { describe, expect, it } from "vitest";
import { ProtocolException } from "../common/protocol-exception.js";
import { sanitizeNickname } from "./nickname.js";

const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const NON_BREAKING_SPACE = String.fromCharCode(0x00a0);
const NULL_CHAR = String.fromCharCode(0);

describe("guest nicknames", () => {
  it("keeps the client supplied name, trimmed", () => {
    expect(sanitizeNickname("  장기왕  ")).toBe("장기왕");
    expect(sanitizeNickname("Player One")).toBe("Player One");
  });

  it("collapses whitespace and strips invisible characters", () => {
    expect(sanitizeNickname("한\t\t량")).toBe("한 량");
    expect(sanitizeNickname(`초${ZERO_WIDTH_SPACE}보`)).toBe("초보");
    expect(sanitizeNickname(`한${NULL_CHAR}량`)).toBe("한량");
  });

  it("rejects empty and oversized names", () => {
    for (const bad of ["", "   ", NON_BREAKING_SPACE, ZERO_WIDTH_SPACE, 42, null, undefined, {}]) {
      expect(() => sanitizeNickname(bad)).toThrow(ProtocolException);
    }
    expect(() => sanitizeNickname("x".repeat(17))).toThrow(/at most 16/);
    expect(sanitizeNickname("x".repeat(16))).toHaveLength(16);
  });

  it("reports INVALID_NICKNAME as the wire error code", () => {
    try {
      sanitizeNickname("");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ProtocolException).code).toBe("INVALID_NICKNAME");
    }
  });
});
