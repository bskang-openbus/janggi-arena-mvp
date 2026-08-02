/** Runtime configuration. Everything is env driven; the literals below are defaults only. */

export const SERVER_CONFIG = Symbol.for("janggi.server.config");

export interface ServerConfig {
  /** HTTP/socket.io port. Web runs on 3002, so the API default is 3002 - 1. */
  readonly port: number;
  readonly host: string;
  /** Milliseconds a side has to play a single move. */
  readonly turnTimeoutMs: number;
  /** Auto passes (turn timeouts) a side may accumulate before losing the game. */
  readonly autoPassLimit: number;
  /** socket.io CORS origins. `true` = reflect request origin (dev default). */
  readonly corsOrigin: true | string[];
}

export const DEFAULT_PORT = 3001;
export const DEFAULT_TURN_TIMEOUT_MS = 60_000;
export const DEFAULT_AUTO_PASS_LIMIT = 2;

function intFromEnv(raw: string | undefined, fallback: number, min: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const origins = (env.CORS_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  return {
    port: intFromEnv(env.PORT, DEFAULT_PORT, 0),
    host: env.HOST && env.HOST.trim() !== "" ? env.HOST.trim() : "0.0.0.0",
    turnTimeoutMs: intFromEnv(env.TURN_TIMEOUT_MS, DEFAULT_TURN_TIMEOUT_MS, 100),
    autoPassLimit: intFromEnv(env.AUTO_PASS_LIMIT, DEFAULT_AUTO_PASS_LIMIT, 1),
    corsOrigin: origins.length > 0 ? origins : true,
  };
}
