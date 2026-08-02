import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const ARTIFACTS = path.resolve(__dirname, "../../../artifacts");

export interface Fixture {
  description: string;
  moves: { from: string; to: string }[];
  expect: Record<string, unknown>;
}

/** Land on 타이틀 → 로컬 대국 → wait for the board + the test bridge. */
export async function startLocalGame(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("title-screen")).toBeVisible();
  await page.getByTestId("start-local-button").click();
  await expect(page.getByTestId("game-screen")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__janggi));
}

/** Blocks until the P3 capture cinematic has released the input lock. */
export async function waitCinematicIdle(page: Page) {
  await page.waitForFunction(
    () => window.__janggi!.snapshot().cinematic === "idle",
    undefined,
    { timeout: 15_000 },
  );
}

/**
 * Drive the cinematic to exactly `t` and wait for the frame that renders it.
 *
 * Requires `pauseCinematic()` to have been armed *before* the capturing move.
 * Without that the timeline runs on the wall clock, which under full-suite
 * load can finish before Playwright's first poll — the frame you asked for
 * would then never come back.
 */
export async function seekCinematic(page: Page, t: number) {
  await page.evaluate((target) => window.__janggi!.seekCinematic(target), t);
  await page.waitForFunction(
    (target) => window.__janggi!.snapshot().cinematicT >= target - 1e-4,
    t,
    { timeout: 10_000 },
  );
}

/** Arm the deterministic clock, then play `move` (which must be a capture). */
export async function playCapturePaused(
  page: Page,
  move: { from: string; to: string },
) {
  await page.evaluate(() => window.__janggi!.pauseCinematic());
  await page.evaluate((m) => window.__janggi!.play(m.from, m.to), move);
  const snapshot = await page.evaluate(() => window.__janggi!.snapshot());
  expect(
    snapshot.cinematic,
    `${move.from}→${move.to} did not start a capture cinematic`,
  ).toBe("cinematic");
  return snapshot;
}

/**
 * Give the clock back to real time and let the timeline play itself out.
 * Use where the *release* of the input lock is what's under test.
 */
export async function resumeAndFinish(page: Page) {
  await page.evaluate(() => window.__janggi!.resumeCinematic());
  await waitCinematicIdle(page);
}

/**
 * Teardown counterpart: jump past the end of the timeline instead of waiting
 * out the remaining wall-clock seconds, then hand the clock back.
 */
export async function finishCinematic(page: Page) {
  await page.evaluate(() => window.__janggi!.seekCinematic(9));
  await waitCinematicIdle(page);
  await page.evaluate(() => window.__janggi!.resumeCinematic());
}

export interface PlayOptions {
  /**
   * What to do when a move triggers the P3 capture cinematic:
   *  - "skip"  (default) dispatch the same action a tap on the overlay does,
   *            so bulk replays stay fast and deterministic
   *  - "watch" let the ~2.9s timeline run to completion
   */
  cinematics?: "skip" | "watch";
}

/**
 * Replays a fixture through the UI gesture path (select mover → click
 * destination) one move at a time, so React commits between plies exactly as
 * it does for a human player.
 *
 * A capture locks the board for the length of the cinematic, so the replay has
 * to clear that lock before the next ply — exactly like a player who taps to
 * skip through it.
 */
export async function playMoves(
  page: Page,
  moves: { from: string; to: string }[],
  { cinematics = "skip" }: PlayOptions = {},
) {
  for (const [i, move] of moves.entries()) {
    // One round trip per ply — play, clear the lock and read back together.
    // Still one *ply* per trip (not the whole list in a single evaluate) so
    // React commits between plies exactly as it does for a human player.
    let snapshot = await page.evaluate(
      ({ m, skip }) => {
        window.__janggi!.play(m.from, m.to);
        if (skip) window.__janggi!.skipCinematic();
        return window.__janggi!.snapshot();
      },
      { m: move, skip: cinematics === "skip" },
    );

    if (snapshot.cinematic !== "idle") {
      await waitCinematicIdle(page);
      snapshot = await page.evaluate(() => window.__janggi!.snapshot());
    }

    expect(
      snapshot.moves,
      `move ${i + 1} (${move.from}→${move.to}) was rejected by the engine`,
    ).toBe(i + 1);
    expect(
      snapshot.cinematic,
      `cinematic still held the input lock after move ${i + 1}`,
    ).toBe("idle");
  }
}

/** Procedural textures + the first bloom pass need a moment under SwiftShader. */
export async function settleScene(page: Page, ms = 1800) {
  await page.waitForTimeout(ms);
}
