import { randomInt } from "node:crypto";

/**
 * 6 character alphanumeric room codes.
 * The alphabet drops the visually ambiguous 0/O and 1/I/L so codes survive being read aloud.
 */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

const MAX_ATTEMPTS = 200;

export type RandomIndex = (exclusiveMax: number) => number;

const cryptoRandomIndex: RandomIndex = (max) => randomInt(max);

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code);
}

/** Uppercases and strips separators people type ("ab-c d1" -> "ABCD1"). */
export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

function draw(random: RandomIndex): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[random(ROOM_CODE_ALPHABET.length)] ?? ROOM_CODE_ALPHABET[0];
  }
  return code;
}

/**
 * Generates a code that `isTaken` rejects. Retries on collision; after MAX_ATTEMPTS it
 * throws rather than silently handing out a duplicate.
 */
export function generateRoomCode(
  isTaken: (code: string) => boolean,
  random: RandomIndex = cryptoRandomIndex,
): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = draw(random);
    if (!isTaken(code)) return code;
  }
  throw new Error("could not allocate a free room code");
}
