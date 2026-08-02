import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyAction, initialState, isLegal, parseNotation } from "./index.js";
import type { Action, GameState, Side } from "./index.js";

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/web/e2e/fixtures");

interface Fixture {
  description: string;
  moves: Array<{ from: string; to: string }>;
  expect: { captureAt?: number; capturedType?: string; result?: "checkmate"; winner?: Side };
}

function load(name: string): Fixture {
  return JSON.parse(readFileSync(resolve(FIXTURE_DIR, name), "utf8")) as Fixture;
}

/** Replays a fixture, asserting every single move is legal at the moment it is played. */
function replay(fx: Fixture): { states: GameState[]; final: GameState } {
  let s = initialState();
  const states = [s];
  fx.moves.forEach((m, i) => {
    const action: Action = {
      kind: "move",
      move: { from: parseNotation(m.from), to: parseNotation(m.to) },
    };
    expect(isLegal(s, action), `move ${i} (${m.from}->${m.to}) must be legal`).toBe(true);
    s = applyAction(s, action);
    states.push(s);
  });
  return { states, final: s };
}

describe("E2E 기보 픽스처 (docs/RULES.md 6절)", () => {
  it("capture-game.json: 전 수 합법이고 예고된 시점에 초 차가 한 병을 잡는다", () => {
    const fx = load("capture-game.json");
    expect(fx.moves.length).toBeLessThanOrEqual(9);
    const { states, final } = replay(fx);
    const at = fx.expect.captureAt!;
    expect(typeof at).toBe("number");

    const captureState = states[at + 1]!;
    const applied = captureState.history.at(-1)!;
    expect(applied.captured?.type).toBe(fx.expect.capturedType);
    expect(applied.captured?.side).toBe("han");

    // the capturing piece must be the cho chariot
    const before = states[at]!;
    const from = parseNotation(fx.moves[at]!.from);
    expect(before.board[from.rank]![from.file]).toMatchObject({ side: "cho", type: "chariot" });

    // no other capture happens in the record
    const captures = final.history.filter((h) => h.captured !== null);
    expect(captures).toHaveLength(1);
    expect(final.result).toBeNull();
  });

  it("mate-game.json: 전 수 합법이고 마지막 수에서 외통으로 끝난다", () => {
    const fx = load("mate-game.json");
    const { states, final } = replay(fx);
    expect(final.result).toEqual({ type: "checkmate", winner: fx.expect.winner });
    expect(fx.expect.result).toBe("checkmate");
    // only the very last move ends the game
    for (let i = 0; i < states.length - 1; i++) expect(states[i]!.result, `state ${i}`).toBeNull();
    expect(final.history.at(-1)!.check).toBe(true);
  });
});
