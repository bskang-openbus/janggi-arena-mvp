import path from "node:path";
import { expect, test } from "@playwright/test";
import captureGame from "./fixtures/capture-game.json";
import mateGame from "./fixtures/mate-game.json";
import { ARTIFACTS, playMoves, settleScene, startLocalGame } from "./helpers";

/**
 * P2 gate — engine ⇄ 3D board integration driven from the UI.
 * Artifacts for the morning review:
 *   p2-title.png    타이틀 화면
 *   p2-initial.png  초기 배치 + 초 차례
 *   p2-capture.png  7수째 포획 직후 (잡힌 말 목록에 兵)
 *   p2-mate.png     외통 결과 오버레이
 */

test("타이틀 화면에서 로컬 대국을 시작한다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("title-screen")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("장기 아레나");
  await page.screenshot({ path: path.join(ARTIFACTS, "p2-title.png") });

  await page.getByTestId("start-local-button").click();
  await expect(page.getByTestId("game-screen")).toBeVisible();
  await expect(page.getByTestId("turn-indicator")).toHaveText("초 차례");
  await expect(page.getByTestId("last-move")).toContainText("대국 시작");

  await settleScene(page, 2500);
  await page.screenshot({ path: path.join(ARTIFACTS, "p2-initial.png") });
});

test("초기 배치 32기물이 엔진 상태에서 렌더된다", async ({ page }) => {
  await startLocalGame(page);
  const pieceCount = await page.evaluate(() => {
    // the scene is fed straight from the engine board
    return window.__janggi!.snapshot();
  });
  expect(pieceCount.turn).toBe("cho");
  expect(pieceCount.moves).toBe(0);
  await expect(page.getByTestId("captured-cho")).toHaveAttribute(
    "data-total",
    "0",
  );
  await expect(page.getByTestId("captured-han")).toHaveAttribute(
    "data-total",
    "0",
  );
});

test("기물 선택 → 합법 도착점만 하이라이트, 비합법 클릭은 무시", async ({ page }) => {
  await startLocalGame(page);

  // 초 졸 a4 → a5 만 가능 (후퇴 금지, 좌우 b4)
  const afterSelect = await page.evaluate(() => {
    window.__janggi!.clickPiece("a4");
    return window.__janggi!.snapshot();
  });
  expect(afterSelect.selected).not.toBeNull();
  expect(new Set(afterSelect.highlights)).toEqual(new Set(["a5", "b4"]));

  // 비합법 도착점 클릭 → 무시 (수는 늘지 않고 선택만 해제/유지)
  const afterIllegal = await page.evaluate(() => {
    window.__janggi!.clickSquare("i9");
    return window.__janggi!.snapshot();
  });
  expect(afterIllegal.moves).toBe(0);

  // 상대(한) 기물은 선택되지 않는다
  const afterEnemy = await page.evaluate(() => {
    window.__janggi!.clickPiece("a7");
    return window.__janggi!.snapshot();
  });
  expect(afterEnemy.selected).toBeNull();
  expect(afterEnemy.highlights).toHaveLength(0);

  // 같은 기물 재클릭 = 선택 해제
  const toggled = await page.evaluate(() => {
    window.__janggi!.clickPiece("a4");
    window.__janggi!.clickPiece("a4");
    return window.__janggi!.snapshot();
  });
  expect(toggled.selected).toBeNull();

  // 합법 이동은 반영된다
  const moved = await page.evaluate(() => {
    window.__janggi!.play("a4", "a5");
    return window.__janggi!.snapshot();
  });
  expect(moved.moves).toBe(1);
  expect(moved.turn).toBe("han");
  await expect(page.getByTestId("turn-indicator")).toHaveText("한 차례");
  await expect(page.getByTestId("last-move")).toContainText("초 卒 a4→a5");
});

test("포획 기보: 7수째 포획이 잡힌 말 목록에 반영된다", async ({ page }) => {
  await startLocalGame(page);
  await playMoves(page, captureGame.moves);

  const snapshot = await page.evaluate(() => window.__janggi!.snapshot());
  expect(snapshot.moves).toBe(captureGame.moves.length);
  expect(snapshot.lastCapture).not.toBeNull();
  expect(snapshot.lastCapture!.type).toBe(captureGame.expect.capturedType);
  expect(snapshot.lastCapture!.seq).toBe(captureGame.expect.captureAt);

  // 초가 한 병(兵)을 잡았다 → 초 전과 패널에 兵
  const choTrophies = page.getByTestId("captured-cho");
  await expect(choTrophies).toHaveAttribute("data-total", "1");
  await expect(choTrophies.getByTestId("captured-cho-soldier")).toContainText(
    "兵",
  );
  await expect(page.getByTestId("captured-han")).toHaveAttribute(
    "data-total",
    "0",
  );
  await expect(page.getByTestId("last-move")).toContainText("a1→a7");
  await expect(page.getByTestId("last-move")).toContainText("兵 포획");

  await settleScene(page, 2200);
  await page.screenshot({ path: path.join(ARTIFACTS, "p2-capture.png") });
});

test("외통 기보: 결과 오버레이가 승자를 표시하고 재대국이 동작한다", async ({
  page,
}) => {
  await startLocalGame(page);
  await playMoves(page, mateGame.moves);

  const snapshot = await page.evaluate(() => window.__janggi!.snapshot());
  expect(snapshot.result).toBe(mateGame.expect.result);

  const overlay = page.getByTestId("result-overlay");
  await expect(overlay).toBeVisible();
  await expect(page.getByTestId("result-title")).toHaveText("초 승");
  await expect(page.getByTestId("result-detail")).toContainText("외통");

  await settleScene(page, 2200);
  await page.screenshot({ path: path.join(ARTIFACTS, "p2-mate.png") });

  // 종료 후에는 추가 착수 불가
  const frozen = await page.evaluate(() => {
    window.__janggi!.play("a4", "a5");
    return window.__janggi!.snapshot();
  });
  expect(frozen.moves).toBe(mateGame.moves.length);

  await page.getByTestId("rematch-button").click();
  await expect(overlay).toBeHidden();
  await expect(page.getByTestId("turn-indicator")).toHaveText("초 차례");
  const restarted = await page.evaluate(() => window.__janggi!.snapshot());
  expect(restarted.moves).toBe(0);
  expect(restarted.result).toBeNull();
});

test("한수쉼은 평시에 동작하고 장군 중에는 비활성화된다", async ({ page }) => {
  await startLocalGame(page);
  const passButton = page.getByTestId("pass-button");

  // 평시: 한수쉼으로 차례만 넘어간다
  await expect(passButton).toBeEnabled();
  await passButton.click();
  await expect(page.getByTestId("turn-indicator")).toHaveText("한 차례");
  await expect(page.getByTestId("last-move")).toContainText("초 한수쉼");

  // 장군 국면: mate 기보 5수째(초 e4→d4)에서 한이 장군을 당한다
  await page.getByTestId("restart-button").click();
  await playMoves(page, mateGame.moves.slice(0, 5));

  await expect(page.getByTestId("check-banner")).toBeVisible();
  await expect(page.getByTestId("check-banner")).toContainText("장군");
  await expect(passButton).toBeDisabled();
  await expect(passButton).toHaveAttribute("title", /장군 상태/);

  // 스토어 레벨에서도 패스가 거부되어야 한다 (버튼 우회 방지)
  const before = await page.evaluate(() => window.__janggi!.snapshot());
  expect(before.turn).toBe("han");
  const after = await page.evaluate(() => {
    window.__janggi!.pass();
    return window.__janggi!.snapshot();
  });
  expect(after.moves).toBe(before.moves);
  expect(after.turn).toBe("han");

  await settleScene(page, 1500);
  await page.screenshot({ path: path.join(ARTIFACTS, "p2-check.png") });
});

test("재시작 버튼이 대국을 초기화한다", async ({ page }) => {
  await startLocalGame(page);
  await playMoves(page, captureGame.moves.slice(0, 3));
  await page.getByTestId("restart-button").click();
  await expect(page.getByTestId("turn-indicator")).toHaveText("초 차례");
  await expect(page.getByTestId("last-move")).toContainText("대국 시작");
  const snapshot = await page.evaluate(() => window.__janggi!.snapshot());
  expect(snapshot.moves).toBe(0);
});

test.describe("모바일 뷰포트", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("좁은 화면에서도 UI가 깨지지 않고 터치 입력이 동작한다", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("start-local-button").tap();
    await expect(page.getByTestId("game-screen")).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__janggi));

    await expect(page.getByTestId("turn-indicator")).toBeVisible();
    await expect(page.getByTestId("captured-cho")).toBeVisible();
    await expect(page.getByTestId("captured-han")).toBeVisible();
    await expect(page.getByTestId("pass-button")).toBeVisible();

    // 가로 스크롤이 생기지 않아야 한다
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // 터치로 하단 버튼이 실제 동작
    await page.getByTestId("pass-button").tap();
    const snapshot = await page.evaluate(() => window.__janggi!.snapshot());
    expect(snapshot.moves).toBe(1);
    expect(snapshot.turn).toBe("han");
  });
});
