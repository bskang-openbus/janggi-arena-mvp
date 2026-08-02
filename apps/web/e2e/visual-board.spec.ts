import path from "node:path";
import { expect, test } from "@playwright/test";
import captureGame from "./fixtures/capture-game.json";
import { ARTIFACTS, playMoves, settleScene, startLocalGame } from "./helpers";

/**
 * P2 visual gate — now driven by real engine state (the demo stub is gone).
 *   visual-board.png    — 마상상마 초기 배치
 *   visual-selected.png — 선택 리프트 + 이동/포획 마커 + 마지막 수 잔광
 */
test("3D 보드가 엔진 초기 배치를 렌더한다", async ({ page }) => {
  await startLocalGame(page);
  await settleScene(page, 2500);
  await page.screenshot({ path: path.join(ARTIFACTS, "visual-board.png") });
});

test("선택 시 합법 도착점과 포획 마커가 보인다", async ({ page }) => {
  await startLocalGame(page);

  // 포획 기보의 6수까지 진행 → 마지막 수 잔광(c7→b7)이 남는다
  await playMoves(page, captureGame.moves.slice(0, 6));

  // 초 차(a1) 선택 — a2..a6 이동 마커 + a7(한 병) 포획 마커가 동시에 보인다
  const snapshot = await page.evaluate(() => {
    window.__janggi!.clickPiece("a1");
    return window.__janggi!.snapshot();
  });
  expect(snapshot.selected).not.toBeNull();
  expect(snapshot.highlights).toContain("a7");

  await settleScene(page, 2000);
  await page.screenshot({ path: path.join(ARTIFACTS, "visual-selected.png") });
});

/** lowSpec=true must still render a usable board (post-processing disabled). */
test("저사양 모드에서도 보드가 렌더된다", async ({ page }) => {
  await startLocalGame(page);
  await settleScene(page, 1200);
  await page.getByTestId("lowspec-button").click();
  await settleScene(page, 1200);
  await expect(page.locator("canvas")).toBeVisible();
});
