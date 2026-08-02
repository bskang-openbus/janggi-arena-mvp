import path from "node:path";
import { expect, test } from "@playwright/test";
import captureGame from "./fixtures/capture-game.json";
import {
  ARTIFACTS,
  playMoves,
  settleScene,
  startLocalGame,
  waitCinematicIdle,
} from "./helpers";

/**
 * P3 gate — Tier 1 공통 포획 연출 (docs/SCENES.md 2절).
 * Artifacts for the morning review:
 *   p3-before.png  포획 직전 (연출 전 대국 화면)
 *   p3-during.png  타격~디졸브 구간 (t ≈ 1.3s)
 *   p3-after.png   연출 종료 후 (혈흔 데칼이 남은 보드)
 *   p3-nogore.png  혈흔 OFF 상태의 같은 타격 프레임
 */

const CAPTURE = captureGame.moves[captureGame.moves.length - 1];
const SETUP = captureGame.moves.slice(0, -1);

/**
 * Wait until the cinematic clock reaches `t`.
 *
 * A canvas screenshot under SwiftShader costs ~0.3s, so every capture below
 * arms itself slightly *before* the beat it wants to land on.
 */
async function advanceTo(page: import("@playwright/test").Page, t: number) {
  await page.waitForFunction(
    (target) => window.__janggi!.snapshot().cinematicT >= target,
    t,
    { timeout: 10_000 },
  );
}

test("포획 시 공통 전투 연출이 재생되고 연출 중 입력이 잠긴다", async ({
  page,
}) => {
  await startLocalGame(page);
  await playMoves(page, SETUP);

  await settleScene(page, 1400);
  await page.screenshot({ path: path.join(ARTIFACTS, "p3-before.png") });
  const before = await page.evaluate(() => window.__janggi!.sampleFrame());
  expect(before, "sampleFrame needs preserveDrawingBuffer").not.toBeNull();

  // ── 포획 → 연출 진입 ────────────────────────────────────────────
  await page.evaluate(
    (m) => window.__janggi!.play(m.from, m.to),
    CAPTURE,
  );
  const entered = await page.evaluate(() => window.__janggi!.snapshot());
  expect(entered.moves).toBe(captureGame.moves.length);
  expect(entered.cinematic).toBe("cinematic");
  await expect(page.getByTestId("game-screen")).toHaveAttribute(
    "data-cinematic",
    "cinematic",
  );
  await expect(page.getByTestId("cinematic-overlay")).toBeVisible();
  await expect(page.getByTestId("skip-cinematic-button")).toBeVisible();

  // ── 타격 구간 (1.2s 히트스톱·플래시·충격파) ───────────────────
  await advanceTo(page, 1.02);
  await page.screenshot({ path: path.join(ARTIFACTS, "p3-during.png") });

  const during = await page.evaluate(() => ({
    frame: window.__janggi!.sampleFrame(),
    t: window.__janggi!.snapshot().cinematicT,
  }));
  // 캡처된 프레임이 타격~디졸브 구간 안이었음을 보증
  expect(during.t).toBeGreaterThan(1.02);
  expect(during.t).toBeLessThan(2.3);

  // 연출 프레임이 빈 화면(전부 검정/전부 흰색)이 아니어야 한다
  expect(during.frame!.mean).toBeGreaterThan(4);
  expect(during.frame!.mean).toBeLessThan(235);
  expect(
    during.frame!.hot,
    "타격 프레임에 밝은 이펙트 픽셀이 없다 (플래시/스파크/디졸브 미표시)",
  ).toBeGreaterThan(before!.hot);
  expect(during.frame!.colored).toBeGreaterThan(0.02);

  // ── 연출 중 보드 입력 잠금 ──────────────────────────────────────
  // 한 차례이고 b7 병 → b6은 합법 수다. 잠금이 없다면 통과했을 입력.
  const locked = await page.evaluate(() => {
    window.__janggi!.play("b7", "b6");
    window.__janggi!.clickPiece("b7");
    window.__janggi!.pass();
    return window.__janggi!.snapshot();
  });
  expect(locked.moves).toBe(captureGame.moves.length);
  expect(locked.selected).toBeNull();

  // ── 2.8s 이후 자동 해제 ─────────────────────────────────────────
  await waitCinematicIdle(page);
  const after = await page.evaluate(() => window.__janggi!.snapshot());
  expect(after.cinematic).toBe("idle");
  expect(after.decals).toBe(1); // 혈흔 데칼은 연출이 끝나도 남는다
  await expect(page.getByTestId("cinematic-overlay")).toHaveCount(0);

  await settleScene(page, 900);
  await page.screenshot({ path: path.join(ARTIFACTS, "p3-after.png") });

  // 잠금이 풀렸으니 다시 둘 수 있다
  const resumed = await page.evaluate(() => {
    window.__janggi!.clickPiece("b7");
    return window.__janggi!.snapshot();
  });
  expect(resumed.selected).not.toBeNull();
});

test("디졸브 소멸 구간이 경계 발광과 재 파티클로 렌더된다", async ({ page }) => {
  await startLocalGame(page);
  await playMoves(page, SETUP);

  await page.evaluate((m) => window.__janggi!.play(m.from, m.to), CAPTURE);
  await advanceTo(page, 1.55);
  await page.screenshot({ path: path.join(ARTIFACTS, "p3-dissolve.png") });

  const shot = await page.evaluate(() => ({
    frame: window.__janggi!.sampleFrame(),
    t: window.__janggi!.snapshot().cinematicT,
  }));
  expect(shot.t).toBeGreaterThan(1.5); // 1.5s 디졸브 개시 이후
  expect(shot.t).toBeLessThan(2.3); // 2.3s 카메라 복귀 이전
  expect(shot.frame!.mean).toBeGreaterThan(4);
  expect(shot.frame!.colored).toBeGreaterThan(0.02);

  await waitCinematicIdle(page);
});

test("혈흔 OFF면 백금색으로 대체되고 바닥 데칼이 생기지 않는다", async ({
  page,
}) => {
  await startLocalGame(page);

  await page.getByTestId("settings-button").click();
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  await expect(page.getByTestId("setting-gore")).toHaveAttribute(
    "data-value",
    "on",
  );
  await page.getByTestId("setting-gore").click();
  await expect(page.getByTestId("setting-gore")).toHaveAttribute(
    "data-value",
    "off",
  );
  await page.getByTestId("settings-close-button").click();
  await expect(page.getByTestId("settings-overlay")).toHaveCount(0);

  await playMoves(page, SETUP);
  await page.evaluate((m) => window.__janggi!.play(m.from, m.to), CAPTURE);
  await advanceTo(page, 1.02);
  await page.screenshot({ path: path.join(ARTIFACTS, "p3-nogore.png") });

  const frame = await page.evaluate(() => window.__janggi!.sampleFrame());
  expect(frame!.mean).toBeGreaterThan(4);

  await waitCinematicIdle(page);
  const after = await page.evaluate(() => window.__janggi!.snapshot());
  expect(after.gore).toBe(false);
  expect(after.decals).toBe(0);
});

test("연출 중 화면을 클릭하면 즉시 스킵되고 최종 보드로 점프한다", async ({
  page,
}) => {
  await startLocalGame(page);
  await playMoves(page, SETUP);

  await page.evaluate((m) => window.__janggi!.play(m.from, m.to), CAPTURE);
  await advanceTo(page, 0.45);

  // 화면 아무 곳이나 탭 = 스킵
  await page.getByTestId("cinematic-overlay").click({ position: { x: 40, y: 300 } });

  const skipped = await page.evaluate(() => window.__janggi!.snapshot());
  expect(skipped.cinematic).toBe("idle");
  expect(skipped.moves).toBe(captureGame.moves.length);
  expect(skipped.decals).toBe(1); // 스킵해도 최종 상태(데칼 포함)로 점프
  await expect(page.getByTestId("cinematic-overlay")).toHaveCount(0);

  // 잡힌 말 목록은 엔진 상태 그대로
  await expect(page.getByTestId("captured-cho")).toHaveAttribute(
    "data-total",
    "1",
  );

  // 스킵 직후 바로 다음 수를 둘 수 있다
  const resumed = await page.evaluate(() => {
    window.__janggi!.play("b7", "b6");
    return window.__janggi!.snapshot();
  });
  expect(resumed.moves).toBe(captureGame.moves.length + 1);
});
