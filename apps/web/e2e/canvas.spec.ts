import path from "node:path";
import { expect, test } from "@playwright/test";

// P0 gate: the home page must render an R3F canvas. This is a placeholder
// scene — real board/piece rendering + input lands in P2.
test("home page renders an R3F canvas and captures a screenshot", async ({
  page,
}) => {
  await page.goto("/");

  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();

  // give the WebGL context a moment to paint the first frame
  await page.waitForTimeout(300);

  const artifactsDir = path.resolve(__dirname, "../../../artifacts");
  await page.screenshot({
    path: path.join(artifactsDir, "p0-canvas.png"),
  });
});
