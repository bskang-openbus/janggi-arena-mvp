import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import captureGame from "./fixtures/capture-game.json";
import mateGame from "./fixtures/mate-game.json";
import {
  ARTIFACTS,
  finishCinematic,
  playCapturePaused,
  playMoves,
  seekCinematic,
  settleScene,
  startLocalGame,
  type Step,
} from "./helpers";

/**
 * P8 gate — SD 치비 캐릭터 컷인 (CLAUDE.md 8절).
 *
 * 컷인은 연출 상태머신을 고치지 않고 `stage.t`를 관찰만 하므로, P3/P4와 똑같이
 * 결정적 클록(pauseCinematic → seekCinematic)으로 타격 프레임에 세워 두고
 * DOM을 검사한다.
 *
 * Artifacts:
 *   p8-cutin.png          포획 타격 순간 (공격 초 차 + 피격 한 병)
 *   p8-victory-chibi.png  외통 승리 (승자 진영 궁)
 */

const CAPTURE = captureGame.moves[captureGame.moves.length - 1];
const SETUP = captureGame.moves.slice(0, -1);

/** 타격 직후 — 히트스톱 구간이자 컷인의 정점 (CUT.hit = T.impact = 1.2s) */
const IMPACT_T = 1.26;

/** 14장이 전부 브라우저 캐시에 올라올 때까지. 실패해도 게임은 돌지만 이 게이트는 전수 로딩을 요구한다. */
async function waitChibiPreloaded(page: Page) {
  await page.waitForFunction(
    () => {
      const c = window.__janggi!.snapshot().cutin;
      return c.preloaded + c.failed >= 14;
    },
    undefined,
    { timeout: 30_000 },
  );
  const stats = await page.evaluate(() => window.__janggi!.snapshot().cutin);
  expect(stats.failed, "치비 스프라이트 로딩 실패").toBe(0);
  expect(stats.preloaded).toBe(14);
}

test("포획 타격 순간 공격·피격 치비 캐릭터 컷인이 등장한다", async ({ page }) => {
  await startLocalGame(page);
  await waitChibiPreloaded(page);
  await playMoves(page, SETUP);

  await playCapturePaused(page, CAPTURE);

  // 컷인은 붙어 있지만 아직 슬라이드-인 전 (CUT.in = 0.92s)
  await seekCinematic(page, 0.6);
  const early = await page.evaluate(() => window.__janggi!.snapshot().cutin);
  expect(early.kind).toBe("capture");
  expect(early.visible, "0.6s에는 컷인이 아직 보이면 안 된다").toBe(false);

  // ── 타격 프레임 ────────────────────────────────────────────────
  await seekCinematic(page, IMPACT_T);
  await expect(page.getByTestId("cinematic-overlay")).toHaveAttribute(
    "data-beat",
    "impact",
  );

  const attacker = page.getByTestId("cutin-attacker");
  const victim = page.getByTestId("cutin-victim");
  await expect(attacker).toHaveAttribute("data-piece", "cho-chariot");
  await expect(victim).toHaveAttribute("data-piece", "han-soldier");
  // 공격측은 자기 진영(초 = 좌) 쪽, 피격측은 반대편에서 등장한다
  await expect(page.getByTestId("cutin-attacker-slot")).toHaveAttribute(
    "data-edge",
    "left",
  );
  await expect(page.getByTestId("cutin-victim-slot")).toHaveAttribute(
    "data-edge",
    "right",
  );

  // 이미지가 실제로 디코딩까지 끝났는가 (naturalWidth > 0)
  await page.waitForFunction(
    () => window.__janggi!.snapshot().cutin.loaded >= 2,
    undefined,
    { timeout: 15_000 },
  );
  const sizes = await page.evaluate(() =>
    ["cutin-attacker", "cutin-victim"].map((id) => {
      const img = document.querySelector<HTMLImageElement>(
        `[data-testid="${id}"]`,
      );
      return img ? img.naturalWidth : 0;
    }),
  );
  expect(sizes[0]).toBeGreaterThan(0);
  expect(sizes[1]).toBeGreaterThan(0);

  await expect(page.getByTestId("cutin-layer")).toHaveAttribute(
    "data-visible",
    "yes",
  );
  const shot = await page.evaluate(() => window.__janggi!.snapshot());
  expect(shot.cutin.visible, "타격 순간 컷인이 보여야 한다").toBe(true);
  expect(shot.cutin.mounted).toBe(2);
  expect(shot.cinematicT).toBeCloseTo(IMPACT_T, 3);

  await settleScene(page, 250);
  await page.screenshot({ path: path.join(ARTIFACTS, "p8-cutin.png") });

  // ── 노출은 짧다 (CUT.end = 1.62s 이후 완전 제거) ────────────────
  await seekCinematic(page, 1.75);
  const late = await page.evaluate(() => window.__janggi!.snapshot().cutin);
  expect(late.visible, "1.75s에는 컷인이 사라져 있어야 한다").toBe(false);

  // ── 연출이 끝나면 컷인도 함께 사라지고 기존 연출은 정상 종료 ────
  await finishCinematic(page);
  const after = await page.evaluate(() => window.__janggi!.snapshot());
  expect(after.cinematic).toBe("idle");
  expect(after.cutin.kind).toBeNull();
  expect(after.decals, "컷인이 기존 혈흔 데칼을 방해하면 안 된다").toBe(1);
  await expect(page.getByTestId("cutin-attacker")).toHaveCount(0);
});

test("연출 스킵 시 컷인이 즉시 제거된다", async ({ page }) => {
  await startLocalGame(page);
  await waitChibiPreloaded(page);
  await playMoves(page, SETUP);

  await playCapturePaused(page, CAPTURE);
  await seekCinematic(page, IMPACT_T);
  await expect(page.getByTestId("cutin-attacker")).toBeAttached();

  // 컷인 레이어는 pointer-events-none — 화면 어디를 눌러도 스킵이 먹는다
  await page
    .getByTestId("cinematic-overlay")
    .click({ position: { x: 40, y: 300 } });

  await expect(page.getByTestId("cutin-attacker")).toHaveCount(0);
  const skipped = await page.evaluate(() => window.__janggi!.snapshot());
  expect(skipped.cinematic).toBe("idle");
  expect(skipped.cutin.visible).toBe(false);
  expect(skipped.cutin.kind).toBeNull();

  await page.evaluate(() => window.__janggi!.resumeCinematic());
});

test("외통 승리 연출에 승자 진영 궁 캐릭터가 등장한다", async ({ page }) => {
  await startLocalGame(page);
  await waitChibiPreloaded(page);

  const steps = mateGame.moves as Step[];
  await playMoves(page, steps.slice(0, -1));

  await playCapturePaused(
    page,
    steps[steps.length - 1] as { from: string; to: string },
  );
  await page.evaluate(() => window.__janggi!.skipCinematic());

  await expect(page.getByTestId("victory-overlay")).toBeVisible();

  // 문양 전개(0.4s) 이후 — "외통" 붓글씨와 승자 표기가 함께 서는 구간
  await page.evaluate(() => window.__janggi!.seekCinematic(1.85));
  await page.waitForFunction(
    () => window.__janggi!.snapshot().victoryT >= 1.84,
    undefined,
    { timeout: 10_000 },
  );

  const general = page.getByTestId("cutin-victory");
  await expect(general).toHaveAttribute("data-piece", "cho-general");
  await expect(page.getByTestId("cutin-victory-slot")).toHaveAttribute(
    "data-edge",
    "left",
  );
  await page.waitForFunction(
    () => window.__janggi!.snapshot().cutin.loaded >= 1,
    undefined,
    { timeout: 15_000 },
  );

  await expect(page.getByTestId("cutin-layer")).toHaveAttribute(
    "data-visible",
    "yes",
  );
  const shot = await page.evaluate(() => window.__janggi!.snapshot());
  expect(shot.cutin.kind).toBe("victory");
  expect(shot.cutin.visible).toBe(true);

  // 붓글씨를 가리지 않는다 — 캐릭터와 "외통"의 화면 박스가 겹치지 않아야 한다
  const wordBox = await page.getByTestId("victory-word").boundingBox();
  const chibiBox = await general.boundingBox();
  expect(wordBox).not.toBeNull();
  expect(chibiBox).not.toBeNull();
  expect(
    chibiBox!.x + chibiBox!.width <= wordBox!.x + 4,
    "승리 컷인이 '외통' 붓글씨를 가린다",
  ).toBe(true);

  await settleScene(page, 250);
  await page.screenshot({ path: path.join(ARTIFACTS, "p8-victory-chibi.png") });

  // 실시간으로 돌려주면 결과 화면으로 인계되고 컷인도 사라진다
  await page.evaluate(() => window.__janggi!.resumeCinematic());
  await expect(page.getByTestId("result-overlay")).toBeVisible();
  await expect(page.getByTestId("cutin-victory")).toHaveCount(0);
});

test("캐릭터 컷인 OFF면 컷인 없이 기존 연출만 재생된다", async ({ page }) => {
  await startLocalGame(page);

  await page.getByTestId("settings-button").click();
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  await expect(page.getByTestId("setting-cutin")).toHaveAttribute(
    "data-value",
    "on",
  );
  await page.getByTestId("setting-cutin").click();
  await expect(page.getByTestId("setting-cutin")).toHaveAttribute(
    "data-value",
    "off",
  );
  await page.getByTestId("settings-close-button").click();

  await playMoves(page, SETUP);
  await playCapturePaused(page, CAPTURE);
  await seekCinematic(page, IMPACT_T);

  await expect(page.getByTestId("cutin-attacker")).toHaveCount(0);
  await expect(page.getByTestId("cutin-victim")).toHaveCount(0);
  await expect(page.getByTestId("cutin-layer")).toHaveAttribute(
    "data-enabled",
    "off",
  );

  const off = await page.evaluate(() => window.__janggi!.snapshot());
  expect(off.cutin.enabled).toBe(false);
  expect(off.cutin.visible).toBe(false);
  expect(off.cutin.mounted).toBe(0);
  // 기존 연출은 그대로 — 타격 비트와 혈흔 데칼이 살아 있어야 한다
  await expect(page.getByTestId("cinematic-overlay")).toHaveAttribute(
    "data-beat",
    "impact",
  );

  await finishCinematic(page);
  const after = await page.evaluate(() => window.__janggi!.snapshot());
  expect(after.cinematic).toBe("idle");
  expect(after.decals).toBe(1);
});
