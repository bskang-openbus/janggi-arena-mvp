import path from "node:path";
import { expect, test } from "@playwright/test";
import { ARTIFACTS, settleScene, startLocalGame } from "./helpers";

// P0 gate, kept alive through the P2 flow: 타이틀 → 로컬 대국 → R3F 캔버스.
test("로컬 대국 화면이 R3F 캔버스를 렌더한다", async ({ page }) => {
  await startLocalGame(page);
  await expect(page.locator("canvas")).toBeVisible();
  await settleScene(page, 400);
  await page.screenshot({ path: path.join(ARTIFACTS, "p0-canvas.png") });
});
