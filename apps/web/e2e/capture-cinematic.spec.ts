import path from "node:path";
import { expect, test } from "@playwright/test";
import captureGame from "./fixtures/capture-game.json";
import {
  ARTIFACTS,
  finishCinematic,
  playCapturePaused,
  playMoves,
  resumeAndFinish,
  seekCinematic,
  settleScene,
  startLocalGame,
  waitCinematicIdle,
} from "./helpers";

/**
 * P3 gate — Tier 1 공통 포획 연출 (docs/SCENES.md 2절).
 *
 * Every shot below drives the timeline through the deterministic clock
 * (`pauseCinematic` → `seekCinematic`) rather than racing the wall clock: a
 * Playwright round-trip is slower than the 2.9s cinematic, so under full-suite
 * load the timeline could finish before the first poll ever ran.
 *
 * Artifacts for the morning review:
 *   p3-before.png    포획 직전 (연출 전 대국 화면)
 *   p3-during.png    타격 (t = 1.26s, 히트스톱·플래시·충격파)
 *   p3-dissolve.png  소멸 (t = 1.85s, 경계 발광 + 재 파티클 + 혈흔 데칼)
 *   p3-after.png     연출 종료 후 (혈흔 자국이 남은 보드)
 *   p3-nogore.png    혈흔 OFF 상태의 같은 타격 프레임
 */

const CAPTURE = captureGame.moves[captureGame.moves.length - 1];
const SETUP = captureGame.moves.slice(0, -1);

/**
 * By the time a fixture replay finishes, the scene has been rendering for
 * seconds — every procedural texture is built and the bloom has converged.
 * These waits only cover the piece-glide easing (~90% in 0.3s), so they stay
 * short; the long settles the P2 specs use would be pure idle time here.
 */
const SETTLE_MS = 400;

/** 타격 직후 — 히트스톱이 시간을 멈춰 둔 구간 */
const IMPACT_T = 1.26;
/** 디졸브 중반 — 고스트가 절반쯤 재로 무너진 시점 */
const DISSOLVE_T = 1.85;

test("포획 시 공통 전투 연출이 재생되고 연출 중 입력이 잠긴다", async ({
  page,
}) => {
  await startLocalGame(page);
  await playMoves(page, SETUP);

  await settleScene(page, SETTLE_MS);
  await page.screenshot({ path: path.join(ARTIFACTS, "p3-before.png") });
  const before = await page.evaluate(() => window.__janggi!.sampleFrame());
  expect(before, "sampleFrame needs preserveDrawingBuffer").not.toBeNull();

  // ── 포획 → 연출 진입 ────────────────────────────────────────────
  const entered = await playCapturePaused(page, CAPTURE);
  expect(entered.moves).toBe(captureGame.moves.length);
  await expect(page.getByTestId("game-screen")).toHaveAttribute(
    "data-cinematic",
    "cinematic",
  );
  await expect(page.getByTestId("cinematic-overlay")).toBeVisible();
  await expect(page.getByTestId("skip-cinematic-button")).toBeVisible();

  // ── 타격 구간 (1.2s 히트스톱·플래시·충격파) ───────────────────
  await seekCinematic(page, IMPACT_T);
  await expect(page.getByTestId("cinematic-overlay")).toHaveAttribute(
    "data-beat",
    "impact",
  );
  await page.screenshot({ path: path.join(ARTIFACTS, "p3-during.png") });

  const during = await page.evaluate(() => ({
    frame: window.__janggi!.sampleFrame(),
    t: window.__janggi!.snapshot().cinematicT,
  }));
  // 클록이 멈춰 있으므로 캡처된 프레임은 정확히 이 시각이다
  expect(during.t).toBeCloseTo(IMPACT_T, 3);

  // 연출 프레임이 빈 화면(전부 검정/전부 흰색)이 아니어야 한다
  expect(during.frame!.mean).toBeGreaterThan(4);
  expect(during.frame!.mean).toBeLessThan(235);
  expect(
    during.frame!.hot,
    "타격 프레임에 밝은 이펙트 픽셀이 없다 (플래시/스파크/충격파 미표시)",
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

  // ── 실시간으로 돌려주면 2.8s 이후 자동 해제 ─────────────────────
  await resumeAndFinish(page);
  const after = await page.evaluate(() => window.__janggi!.snapshot());
  expect(after.cinematic).toBe("idle");
  expect(after.decals).toBe(1); // 혈흔 데칼은 연출이 끝나도 남는다
  await expect(page.getByTestId("cinematic-overlay")).toHaveCount(0);

  await settleScene(page, SETTLE_MS);
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

  await playCapturePaused(page, CAPTURE);
  await seekCinematic(page, DISSOLVE_T);
  await expect(page.getByTestId("cinematic-overlay")).toHaveAttribute(
    "data-beat",
    "dissolve",
  );

  // 데칼은 1.5s에 커밋되고 자기 시계로 0.45초에 걸쳐 나타난다. 연출 시간은
  // 멈춰 있으므로 여기서 기다리는 것은 데칼 페이드뿐이다 (포화하면 끝).
  await page.waitForFunction(
    () => window.__janggi!.snapshot().decals === 1,
    undefined,
    { timeout: 10_000 },
  );
  await settleScene(page, 500);
  await page.screenshot({ path: path.join(ARTIFACTS, "p3-dissolve.png") });

  const shot = await page.evaluate(() => ({
    frame: window.__janggi!.sampleFrame(),
    t: window.__janggi!.snapshot().cinematicT,
  }));
  expect(shot.t).toBeCloseTo(DISSOLVE_T, 3);
  expect(shot.frame!.mean).toBeGreaterThan(4);
  expect(shot.frame!.mean).toBeLessThan(235);
  expect(shot.frame!.colored).toBeGreaterThan(0.02);

  await finishCinematic(page);
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
  await playCapturePaused(page, CAPTURE);

  // 혈흔 ON 프레임과 정확히 같은 시각이라 두 스크린샷이 직접 비교 가능하다
  await seekCinematic(page, IMPACT_T);
  await page.screenshot({ path: path.join(ARTIFACTS, "p3-nogore.png") });

  const frame = await page.evaluate(() => window.__janggi!.sampleFrame());
  expect(frame!.mean).toBeGreaterThan(4);
  expect(frame!.mean).toBeLessThan(235);

  await finishCinematic(page);
  const after = await page.evaluate(() => window.__janggi!.snapshot());
  expect(after.gore).toBe(false);
  expect(after.decals).toBe(0);
});

test("연출 중 화면을 클릭하면 즉시 스킵되고 최종 보드로 점프한다", async ({
  page,
}) => {
  await startLocalGame(page);
  await playMoves(page, SETUP);

  await playCapturePaused(page, CAPTURE);
  await seekCinematic(page, 0.45); // 소환진이 펼쳐진 시점에서 스킵
  await expect(page.getByTestId("cinematic-overlay")).toHaveAttribute(
    "data-beat",
    "sigil",
  );

  // 화면 아무 곳이나 탭 = 스킵
  await page
    .getByTestId("cinematic-overlay")
    .click({ position: { x: 40, y: 300 } });

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

  // 스킵 직후 바로 다음 수를 둘 수 있다 (연출 없는 수 → 잠금도 없다)
  await page.evaluate(() => window.__janggi!.resumeCinematic());
  const resumed = await page.evaluate(() => {
    window.__janggi!.play("b7", "b6");
    return window.__janggi!.snapshot();
  });
  expect(resumed.moves).toBe(captureGame.moves.length + 1);
  await waitCinematicIdle(page);
});
