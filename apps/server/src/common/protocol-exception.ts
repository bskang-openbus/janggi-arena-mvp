import type { Ack, ErrorCode, ProtocolError } from "../protocol.js";

/** Domain-level failure carrying a stable wire error code. */
export class ProtocolException extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "ProtocolException";
    this.code = code;
  }

  toError(): ProtocolError {
    return { code: this.code, message: this.message };
  }
}

export function ok<T extends object>(data: T): Ack<T> {
  return { ok: true, ...data };
}

export function fail(code: ErrorCode, message: string): Ack<never> {
  return { ok: false, error: { code, message } };
}

/** Runs a handler and converts thrown ProtocolExceptions into ack error payloads. */
export function toAck<T extends object>(run: () => T): Ack<T> {
  try {
    return ok(run());
  } catch (error) {
    if (error instanceof ProtocolException) return { ok: false, error: error.toError() };
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { code: "INTERNAL_ERROR", message } };
  }
}
