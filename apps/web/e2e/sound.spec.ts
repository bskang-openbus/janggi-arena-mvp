import { expect, type Page, test } from "@playwright/test";
import captureGame from "./fixtures/capture-game.json";
import {
  finishCinematic,
  playCapturePaused,
  playMoves,
  seekCinematic,
  startLocalGame,
} from "./helpers";

/**
 * P6 게이트 — Web Audio 합성 SFX (docs/PRD.md 3절 스트레치).
 *
 * 소리 자체는 E2E로 들을 수 없다. 대신 오디오 엔진이 재생 **호출**을 id별로
 * 세고, 테스트 브리지의 `snapshot().sfx`가 그 카운터를 그대로 노출한다.
 * 그래서 검증하는 것은 "무엇이 언제 트리거되는가" — 즉 연출 타임라인
 * (docs/SCENES.md 2절)의 위상과 사운드 훅이 같은 시각에 있는지다.
 *
 * 결정론적 클록(`pauseCinematic` → `seekCinematic`)으로 타임라인을 직접
 * 몰기 때문에 벽시계와 경쟁하지 않는다.
 */

const CAPTURE = captureGame.moves[captureGame.moves.length - 1];
const SETUP = captureGame.moves.slice(0, -1);

type Counts = Record<string, number>;

async function sfx(page: Page): Promise<Counts> {
  return page.evaluate(() => window.__janggi!.snapshot().sfx);
}

test("연출 타임라인의 각 위상에서 대응하는 합성 SFX가 트리거된다", async ({
  page,
}) => {
  await startLocalGame(page);

  // ── 착수 · 선택 (연출 없는 일반 수) ────────────────────────────
  const opening = await page.evaluate(() => {
    window.__janggi!.clickPiece("a4"); // 기물 선택 → 종지음
    window.__janggi!.clickSquare("b4"); // 착수 → 장기알 딱
    return window.__janggi!.snapshot().sfx;
  });
  expect(opening["piece.select"], "기물 선택음이 울리지 않았다").toBe(1);
  expect(opening["piece.move"], "착수음이 울리지 않았다").toBe(1);

  // ── 비합법 클릭 → 낮은 둔탁음 ─────────────────────────────────
  const denied = await page.evaluate(() => {
    window.__janggi!.clickPiece("i7"); // 한 차례: 병 선택
    window.__janggi!.clickSquare("a1"); // 둘 수 없는 칸 → 선택 해제
    return window.__janggi!.snapshot().sfx;
  });
  expect(denied["piece.deny"], "비합법 클릭음이 울리지 않았다").toBe(1);

  // 나머지 준비 기보 (포획이 없으므로 연출 잠금도 없다 — 한 번에 소화한다)
  await page.evaluate(
    (moves) => window.__janggi!.playAll(moves),
    SETUP.slice(1),
  );
  await expect
    .poll(async () =>
      page.evaluate(() => window.__janggi!.snapshot().moves),
    )
    .toBe(SETUP.length);

  const before = await sfx(page);
  expect(before["cine.sigil"] ?? 0).toBe(0);
  expect(before["cine.impact"] ?? 0).toBe(0);

  // ── 포획 연출 진입 (t = 0) ───────────────────────────────────
  await playCapturePaused(page, CAPTURE);
  const atStart = await sfx(page);
  expect(atStart["piece.move"], "포획도 착수음으로 시작한다").toBe(
    (before["piece.move"] ?? 0) + 1,
  );
  expect(atStart["cine.sigil"] ?? 0, "0.0s에는 소환진음이 아직 이르다").toBe(0);

  // ── 0.3s 소환진 전개 ──────────────────────────────────────────
  await seekCinematic(page, 0.45);
  await expect
    .poll(async () => (await sfx(page))["cine.sigil"] ?? 0)
    .toBe(1);

  // ── 0.8s Tier 2 공격 구간 (차 = 돌진 참격) ────────────────────
  await seekCinematic(page, 0.95);
  await expect
    .poll(async () => (await sfx(page))["cine.atk.charge"] ?? 0)
    .toBe(1);
  const preImpact = await sfx(page);
  expect(
    preImpact["cine.impact"] ?? 0,
    "타격음이 타격 전에 새어 나왔다",
  ).toBe(0);

  // ── 1.2s 타격 — 히트스톱과 같은 프레임 ────────────────────────
  await seekCinematic(page, 1.26);
  await expect
    .poll(async () => (await sfx(page))["cine.impact"] ?? 0, {
      message: "타격 시점에 타격음이 트리거되지 않았다",
    })
    .toBe(1);

  // ── 1.5s 디졸브 소멸 ──────────────────────────────────────────
  await seekCinematic(page, 1.7);
  await expect
    .poll(async () => (await sfx(page))["cine.dissolve"] ?? 0)
    .toBe(1);

  await finishCinematic(page);

  // 위상당 정확히 한 번씩 (연출이 끝나도 중복 트리거 없음)
  const done = await sfx(page);
  expect(done["cine.sigil"]).toBe(1);
  expect(done["cine.atk.charge"]).toBe(1);
  expect(done["cine.impact"]).toBe(1);
  expect(done["cine.dissolve"]).toBe(1);
});

test("사운드 OFF면 어떤 SFX도 재생되지 않고 AudioContext가 정지한다", async ({
  page,
}) => {
  await startLocalGame(page);

  await page.getByTestId("settings-button").click();
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  await expect(page.getByTestId("setting-sound")).toHaveAttribute(
    "data-value",
    "on",
  );
  await page.getByTestId("setting-sound").click();
  await expect(page.getByTestId("setting-sound")).toHaveAttribute(
    "data-value",
    "off",
  );
  await page.getByTestId("settings-close-button").click();

  const muted = await page.evaluate(() => {
    window.__janggi!.clickPiece("a4");
    window.__janggi!.clickSquare("b4");
    return window.__janggi!.snapshot();
  });
  expect(muted.sound).toBe(false);
  expect(muted.moves, "음소거가 대국 진행을 막으면 안 된다").toBe(1);
  expect(muted.sfx["piece.move"] ?? 0, "OFF인데 SFX가 재생됐다").toBe(0);
  expect(muted.sfx["piece.select"] ?? 0).toBe(0);

  // 컨텍스트는 잠들고(suspend), 다시 켜면 살아난다
  await expect
    .poll(async () =>
      page.evaluate(() => window.__janggi!.snapshot().sfxState),
    )
    .not.toBe("running");

  await page.getByTestId("settings-button").click();
  await page.getByTestId("setting-sound").click();
  await expect(page.getByTestId("setting-sound")).toHaveAttribute(
    "data-value",
    "on",
  );
  await page.getByTestId("settings-close-button").click();

  const back = await page.evaluate(() => {
    window.__janggi!.clickPiece("i7");
    return window.__janggi!.snapshot();
  });
  expect(back.sfx["piece.select"] ?? 0, "다시 켜도 소리가 나지 않는다").toBe(1);
});

test("연출을 스킵하면 재생 중인 사운드가 즉시 정지한다", async ({ page }) => {
  await startLocalGame(page);
  await playMoves(page, SETUP);
  await playCapturePaused(page, CAPTURE);

  await seekCinematic(page, 0.45); // 소환진이 울리는 중
  await expect
    .poll(async () => (await sfx(page))["cine.sigil"] ?? 0)
    .toBe(1);

  const live = await page.evaluate(() => window.__janggiSfx!.state());
  await page.evaluate(() => window.__janggi!.skipCinematic());

  const after = await page.evaluate(() => window.__janggi!.snapshot());
  expect(after.cinematic).toBe("idle");
  // 스킵 이후에는 타격·디졸브가 절대 울리지 않는다
  expect(after.sfx["cine.impact"] ?? 0).toBe(0);
  expect(after.sfx["cine.dissolve"] ?? 0).toBe(0);

  await page.evaluate(() => window.__janggi!.resumeCinematic());
  await page.waitForTimeout(600);
  const settled = await sfx(page);
  expect(settled["cine.impact"] ?? 0).toBe(0);
  expect(settled["cine.dissolve"] ?? 0).toBe(0);
  // 오디오가 실제로 돌고 있었다면 스킵은 컨텍스트를 죽이지 않고 보이스만 끊는다
  if (live === "running") {
    expect(await page.evaluate(() => window.__janggiSfx!.state())).toBe(
      "running",
    );
  }
});
