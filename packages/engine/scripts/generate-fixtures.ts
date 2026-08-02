/**
 * Generates the two E2E game records consumed by Playwright (docs/RULES.md 6절).
 *
 *   1. apps/web/e2e/fixtures/capture-game.json — a cho chariot captures a han soldier
 *   2. apps/web/e2e/fixtures/mate-game.json    — a legal game that ends in checkmate
 *
 * Both records are produced *by the engine* and re-validated move by move before being written.
 * Run: node --import ./scripts/ts-resolve.mjs scripts/generate-fixtures.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { allLegalActions, applyAction, initialState, toNotation } from "../src/index.js";
import type { Action, GameState, Side } from "../src/index.js";
import { stateFrom } from "../src/game.js";
import { parseNotation } from "../src/board.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(HERE, "../../../apps/web/e2e/fixtures");

interface Fixture {
  description: string;
  moves: Array<{ from: string; to: string }>;
  expect: {
    captureAt?: number;
    capturedType?: string;
    result?: "checkmate";
    winner?: Side;
  };
}

const mv = (from: string, to: string): Action => ({
  kind: "move",
  move: { from: parseNotation(from), to: parseNotation(to) },
});

/* --------------------------------------------------------------- utilities */

/** Deterministic PRNG (no Math.random, so regenerating the fixtures is reproducible). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function mobility(state: GameState): number {
  return allLegalActions(state).length;
}

function replay(moves: Array<{ from: string; to: string }>): {
  states: GameState[];
  final: GameState;
} {
  let s = initialState();
  const states = [s];
  for (const m of moves) {
    s = applyAction(s, mv(m.from, m.to));
    states.push(s);
  }
  return { states, final: s };
}

/* -------------------------------------------------- fixture 1: 차 → 병 포획 */

/**
 * Hand-authored 7-move opening: cho clears the a file, then the a1 chariot takes the a7 soldier.
 * Verified against the engine below; if it ever became illegal we fail loudly rather than ship it.
 */
const CAPTURE_LINE: Array<{ from: string; to: string }> = [
  { from: "a4", to: "b4" }, // 초 졸: open the a file
  { from: "i7", to: "h7" }, // 한 병
  { from: "e4", to: "e5" }, // 초 졸 전진
  { from: "e7", to: "e6" }, // 한 병 전진
  { from: "g4", to: "f4" }, // 초 졸
  { from: "c7", to: "b7" }, // 한 병
  { from: "a1", to: "a7" }, // 초 차 -> 한 병 포획 (7수째, index 6)
];

function buildCaptureFixture(): Fixture {
  const { states } = replay(CAPTURE_LINE);
  const captureIdx = CAPTURE_LINE.length - 1;
  const applied = states[captureIdx + 1]!.history.at(-1)!;
  if (!applied.captured || applied.captured.type !== "soldier" || applied.captured.side !== "han") {
    throw new Error(`capture line did not capture a han soldier: ${JSON.stringify(applied.captured)}`);
  }
  const mover = states[captureIdx]!.board[0]![0];
  if (!mover || mover.type !== "chariot" || mover.side !== "cho") {
    throw new Error("capture line does not move the cho chariot");
  }
  for (let i = 0; i < CAPTURE_LINE.length - 1; i++) {
    if (states[i + 1]!.history.at(-1)!.captured) throw new Error(`unexpected early capture at ${i}`);
  }
  return {
    description:
      "초 차(a1)가 7수째에 한 병(a7)을 포획하는 합법 기보 — 포획 연출 E2E용 (docs/RULES.md 6절)",
    moves: CAPTURE_LINE,
    expect: { captureAt: captureIdx, capturedType: "soldier" },
  };
}

/* ------------------------------------------------------ fixture 2: 외통 기보 */

/**
 * Cooperative (helpmate) search: cho picks the move that minimises han's mobility, han picks the
 * move that minimises its own — both sides steer towards a legal checkmate. Draw-producing moves
 * are skipped so we always land on a decisive result.
 */
function searchMate(seed: number, maxPlies: number): Array<{ from: string; to: string }> | null {
  const rnd = lcg(seed);
  let state = initialState();
  const moves: Array<{ from: string; to: string }> = [];

  for (let ply = 0; ply < maxPlies; ply++) {
    if (state.result) return state.result.type === "checkmate" ? moves : null;
    const side: Side = state.turn;
    const candidates = allLegalActions(state).filter((a) => a.kind === "move");
    if (candidates.length === 0) return null;

    let best: { action: Action; next: GameState; score: number } | null = null;
    let mateFound: { action: Action; next: GameState } | null = null;

    for (const action of candidates) {
      const next = applyAction(state, action);
      if (next.result?.type === "checkmate") {
        mateFound = { action, next };
        break;
      }
      if (next.result) continue; // never walk into a draw
      const score =
        side === "cho"
          ? mobility(next) // minimise the defender's replies
          : mobility(stateFrom(next.board, "han")); // han strangles itself
      const jitter = rnd() * 0.9;
      if (!best || score + jitter < best.score) best = { action, next, score: score + jitter };
    }

    const chosen = mateFound ?? best;
    if (!chosen) return null;
    if (chosen.action.kind !== "move") return null;
    moves.push({
      from: toNotation(chosen.action.move.from),
      to: toNotation(chosen.action.move.to),
    });
    state = chosen.next;
    if (state.result) return state.result.type === "checkmate" ? moves : null;
  }
  return null;
}

function buildMateFixture(): Fixture {
  let best: { seed: number; moves: Array<{ from: string; to: string }>; winner: Side } | null = null;
  for (let seed = 1; seed <= 60; seed++) {
    const moves = searchMate(seed, 140);
    if (!moves) continue;
    const { final } = replay(moves);
    if (final.result?.type !== "checkmate") continue;
    if (!best || moves.length < best.moves.length) {
      best = { seed, moves, winner: final.result.winner };
      console.log(`  candidate: seed=${seed}, plies=${moves.length}, winner=${best.winner}`);
    }
  }
  if (!best) throw new Error("no checkmate line found");
  console.log(`mate chosen: seed=${best.seed}, plies=${best.moves.length}, winner=${best.winner}`);
  return {
    description: `엔진 협조 탐색(seed ${best.seed})으로 생성한 ${best.moves.length}수 외통 기보 — 결과 화면 E2E용`,
    moves: best.moves,
    expect: { result: "checkmate", winner: best.winner },
  };
}

/* -------------------------------------------------------------------- main */

function write(name: string, fixture: Fixture): void {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const file = resolve(FIXTURE_DIR, name);
  writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  console.log(`wrote ${file} (${fixture.moves.length} moves)`);
}

write("capture-game.json", buildCaptureFixture());
write("mate-game.json", buildMateFixture());
