import path from "node:path";
import { expect, test } from "@playwright/test";

const ARTIFACTS = path.resolve(__dirname, "../../../artifacts");

/**
 * P2 visual gate. Two archived frames for the morning review:
 *   visual-board.png    — clean 마상상마 opening layout
 *   visual-selected.png — selection lift + destination/capture markers +
 *                         last-move afterglow + 장군 pulse
 */
test("3D board renders and the selected state shows highlights", async ({
  page,
}) => {
  await page.goto("/");

  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();

  // procedural textures + the first bloom pass need a moment under SwiftShader
  await page.waitForTimeout(2500);

  await page.screenshot({ path: path.join(ARTIFACTS, "visual-board.png") });

  // last-move afterglow + 장군 (한) warning pulse
  await page.getByTestId("demo-play-move").click();
  await page.getByTestId("demo-toggle-check").click();

  // deterministic selection: the 초 cannon on b3 — its ray ends on 한's cannon,
  // so both the "move" and the "capture" marker styles are visible
  await page.getByTestId("demo-select-focus").click();
  await expect(page.getByTestId("demo-selected-label")).toContainText("cannon");

  await page.waitForTimeout(1500);

  await page.screenshot({ path: path.join(ARTIFACTS, "visual-selected.png") });
});

/** lowSpec=true must still render a usable board (post-processing disabled). */
test("low-spec mode still renders the board", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByTestId("demo-toggle-lowspec").click();
  await page.waitForTimeout(1200);
  await expect(page.locator("canvas")).toBeVisible();
});
