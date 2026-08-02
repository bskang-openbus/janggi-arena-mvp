import { ProtocolException } from "../common/protocol-exception.js";

export const NICKNAME_MAX_LENGTH = 16;

/** C0/C1 controls, zero-width marks, bidi overrides and the BOM. */
function isUnsafeCodePoint(cp: number): boolean {
  if (cp <= 0x1f) return true; // C0 controls
  if (cp >= 0x7f && cp <= 0x9f) return true; // DEL + C1 controls
  if (cp >= 0x200b && cp <= 0x200f) return true; // zero width + LTR/RTL marks
  if (cp >= 0x2028 && cp <= 0x202e) return true; // separators + bidi overrides
  if (cp === 0xfeff) return true; // BOM
  return false;
}

/**
 * Guest nicknames come from the client; the server only sanitises them and maps them to a seat.
 * Whitespace is collapsed, invisible/control characters removed, length capped at 16 code points.
 */
export function sanitizeNickname(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new ProtocolException("INVALID_NICKNAME", "nickname must be a string");
  }
  const points = [...raw.replace(/\s+/g, " ")].filter((ch) => {
    const cp = ch.codePointAt(0);
    return cp !== undefined && !isUnsafeCodePoint(cp);
  });
  const cleaned = points.join("").trim();
  const length = [...cleaned].length;
  if (length === 0) {
    throw new ProtocolException("INVALID_NICKNAME", "nickname must not be empty");
  }
  if (length > NICKNAME_MAX_LENGTH) {
    throw new ProtocolException(
      "INVALID_NICKNAME",
      `nickname must be at most ${NICKNAME_MAX_LENGTH} characters`,
    );
  }
  return cleaned;
}
