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
    await page.evaluate((m) => window.__janggi!.play(m.from, m.to), move);

    if (cinematics === "skip") {
      await page.evaluate(() => window.__janggi!.skipCinematic());
    } else {
      await waitCinematicIdle(page);
    }

    const snapshot = await page.evaluate(() => window.__janggi!.snapshot());
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
