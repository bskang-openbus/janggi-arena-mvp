import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { ARTIFACTS, seekCinematic, settleScene, waitForFonts } from "./helpers";

/**
 * P7 gate — 컴퓨터 대국 (난이도 3단계 · Web Worker 탐색 · 동일 연출).
 *
 * 결정화 전략: AI에 seed를 심으면 `chooseAiAction`이 완전히 재현되므로(계약:
 * docs/AI_API.md) 사람의 수순이 같으면 기보 전체가 같아진다. 선택 화면에는
 * seed 입력이 없으므로(재현은 테스트의 관심사다) 대국에 들어간 뒤 브리지의
 * `startAi`로 같은 설정 + seed로 다시 시작한다.
 *
 * Artifacts:
 *   p7-ai-select.png  난이도 · 진영 선택 화면
 *   p7-ai-game.png    포획 연출 타격 순간 (사람/AI 어느 쪽이 잡아도 같은 연출)
 */

/** 이 파일의 모든 대국을 고정하는 seed. 바꾸면 기보가 통째로 바뀐다. */
const SEED = 20260803;

interface AiSetup {
  level: 1 | 2 | 3;
  mySide: "cho" | "han";
  seed?: number;
}

/** 타이틀 → 컴퓨터 대국 → 난이도·진영 선택 화면. */
async function openAiSetup(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("title-screen")).toBeVisible();
  await page.getByTestId("start-ai-button").click();
  await expect(page.getByTestId("ai-setup")).toBeVisible();
}

/** 선택 화면을 실제로 클릭해 대국에 들어간 뒤, seed를 심어 결정화한다. */
async function startAiGame(page: Page, config: AiSetup) {
  await openAiSetup(page);
  await page.getByTestId(`ai-level-${config.level}`).click();
  await page.getByTestId(`ai-side-${config.mySide}`).click();
  await page.getByTestId("ai-start-button").click();

  await expect(page.getByTestId("game-screen")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__janggi));

  if (config.seed !== undefined) {
    await page.evaluate((c) => window.__janggi!.startAi(c), config);
    await page.waitForFunction(
      (seed) => window.__janggi!.snapshot().ai?.seed === seed,
      config.seed,
    );
  }
}

/** 사람 차례가 돌아올 때까지 (AI 사고 + 예약 착수 + 연출이 모두 끝날 때까지). */
async function waitMyTurn(page: Page) {
  await page.waitForFunction(
    () => {
      const s = window.__janggi!.snapshot();
      if (s.result !== null) return true;
      return (
        s.cinematic === "idle" &&
        s.victory === null &&
        s.ai !== null &&
        !s.ai.thinking &&
        !s.ai.pending &&
        s.turn === s.ai.mySide
      );
    },
    undefined,
    { timeout: 30_000 },
  );
}

/* ------------------------------------------------------------------ */

test("난이도 · 진영 선택 화면에서 3단계와 두 진영을 고를 수 있다", async ({
  page,
}) => {
  await openAiSetup(page);
  const setup = page.getByTestId("ai-setup");

  // 기본값: 초급 + 초(선수)
  await expect(setup).toHaveAttribute("data-level", "1");
  await expect(setup).toHaveAttribute("data-side", "cho");
  await expect(page.getByTestId("ai-level-1")).toHaveAttribute(
    "data-active",
    "true",
  );

  // 3단계가 각각 설명 한 줄을 갖는다
  await expect(page.getByTestId("ai-level-1")).toContainText("초급");
  await expect(page.getByTestId("ai-level-2")).toContainText("중급");
  await expect(page.getByTestId("ai-level-3")).toContainText("고급");
  await expect(page.getByTestId("ai-level-3")).toContainText("깊이 읽고");
  await expect(page.getByTestId("ai-side-cho")).toContainText("선수");
  await expect(page.getByTestId("ai-side-han")).toContainText("후수");

  // 선택이 바뀐다
  await page.getByTestId("ai-level-3").click();
  await page.getByTestId("ai-side-han").click();
  await expect(setup).toHaveAttribute("data-level", "3");
  await expect(setup).toHaveAttribute("data-side", "han");

  // 촬영은 화면 기본값(초급 · 초)으로 되돌려 놓고
  await page.getByTestId("ai-level-1").click();
  await page.getByTestId("ai-side-cho").click();
  await waitForFonts(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ARTIFACTS, "p7-ai-select.png") });

  // 타이틀로 되돌아갈 수 있다
  await page.getByTestId("ai-setup-back-button").click();
  await expect(page.getByTestId("title-screen")).toBeVisible();
});

test("사람이 한 수 두면 AI가 생각한 뒤 응수한다 (2수)", async ({ page }) => {
  await startAiGame(page, { level: 1, mySide: "cho", seed: SEED });

  const screen = page.getByTestId("game-screen");
  await expect(screen).toHaveAttribute("data-mode", "ai");
  await expect(screen).toHaveAttribute("data-my-side", "cho");
  await expect(screen).toHaveAttribute("data-ai", "idle");
  await expect(page.getByTestId("ai-level-badge")).toContainText("초급");
  await expect(page.getByTestId("ai-thinking")).toBeHidden();

  /**
   * "생각 중" 위상을 DOM에서 관찰하고 촬영까지 하려면 800ms 기본 하한은
   * 짧다 (한 장 촬영에 SwiftShader로 1초 넘게 걸린다). 이 구간에서만 늘린다.
   */
  await page.evaluate(() => window.__janggi!.setAiThinkFloor(9000));

  // 사람 수 1회 — 착수와 사고 개시는 같은 tick에서 일어난다
  const armed = await page.evaluate(() => {
    window.__janggi!.play("a4", "a5");
    return window.__janggi!.snapshot();
  });
  expect(armed.moves).toBe(1);
  expect(armed.turn).toBe("han");
  expect(armed.ai).not.toBeNull();
  expect(armed.ai!.thinking).toBe(true);
  expect(armed.ai!.level).toBe(1);
  expect(armed.ai!.mySide).toBe("cho");

  // AI 차례: 표시가 뜨고 입력이 잠긴다
  await expect(screen).toHaveAttribute("data-ai", "thinking");
  await expect(page.getByTestId("ai-thinking")).toBeVisible();
  await expect(page.getByTestId("ai-thinking")).toContainText("생각 중");
  await expect(page.getByTestId("pass-button")).toBeDisabled();
  await expect(page.getByTestId("turn-indicator")).toContainText("컴퓨터");

  // 사람이 판을 건드려도 무시된다 (canAct = false)
  const blocked = await page.evaluate(() => {
    window.__janggi!.clickPiece("c4");
    window.__janggi!.play("c4", "c5");
    window.__janggi!.pass();
    return window.__janggi!.snapshot();
  });
  expect(blocked.moves).toBe(1);
  expect(blocked.selected).toBeNull();
  expect(blocked.ai!.thinking).toBe(true);

  await settleScene(page, 1200);
  // 촬영 직전에 다시 확인 — 하한이 먼저 끝나 버렸다면 조용히 엉뚱한 장면을
  // 남기는 대신 여기서 실패해야 한다
  await expect(page.getByTestId("ai-thinking")).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACTS, "p7-ai-thinking.png") });

  // AI 응수
  await page.evaluate(() => window.__janggi!.setAiThinkFloor());
  await waitMyTurn(page);

  const replied = await page.evaluate(() => window.__janggi!.snapshot());
  expect(replied.moves).toBe(2);
  expect(replied.turn).toBe("cho");
  expect(replied.ai!.thinking).toBe(false);
  expect(replied.ai!.pending).toBe(false);
  // 탐색 지표가 실려 온다 (스텁이면 가짜 값, 실제 엔진이면 진짜 값)
  expect(replied.ai!.depth).not.toBeNull();
  expect(replied.ai!.nodes).toBeGreaterThan(0);
  // 탐색은 Web Worker에서 돈다 (docs/AI_API.md: UI 스레드 블로킹 금지).
  // 메인 스레드 폴백으로 떨어졌다면 워커 배선이 깨진 것이다
  expect(replied.ai!.worker).toBe(true);

  await expect(page.getByTestId("ai-thinking")).toBeHidden();
  await expect(screen).toHaveAttribute("data-ai", "idle");
  await expect(page.getByTestId("turn-indicator")).toContainText("내 차례");
  await expect(page.getByTestId("pass-button")).toBeEnabled();
  await expect(page.getByTestId("last-move")).toContainText("한");

  // 같은 seed면 응수도 같다 — 재시작 후 같은 수순이 같은 기보를 만든다
  const firstReply = await page.getByTestId("last-move").textContent();
  await page.getByTestId("restart-button").click();
  await page.waitForFunction(() => window.__janggi!.snapshot().moves === 0);
  await page.evaluate(() => window.__janggi!.play("a4", "a5"));
  await waitMyTurn(page);
  expect(await page.getByTestId("last-move").textContent()).toBe(firstReply);
});

test("사람이 한(후수)이면 AI(초)가 먼저 두고 카메라는 한 시점이다", async ({
  page,
}) => {
  await startAiGame(page, { level: 2, mySide: "han", seed: SEED });

  await expect(page.getByTestId("game-screen")).toHaveAttribute(
    "data-my-side",
    "han",
  );
  await expect(page.getByTestId("ai-level-badge")).toContainText("중급");

  // AI(초)의 첫 수
  await waitMyTurn(page);
  const opened = await page.evaluate(() => window.__janggi!.snapshot());
  expect(opened.moves).toBe(1);
  expect(opened.turn).toBe("han");
  expect(opened.ai!.mySide).toBe("han");
  expect(opened.ai!.level).toBe(2);
  const opening = await page.getByTestId("last-move").textContent();
  expect(opening).toContain("초");

  await settleScene(page, 1800);
  await page.screenshot({ path: path.join(ARTIFACTS, "p7-ai-han-view.png") });

  // 재시작 = 같은 난이도 · 같은 진영 · 같은 seed → 같은 첫 수
  await page.getByTestId("restart-button").click();
  await waitMyTurn(page);
  const again = await page.evaluate(() => window.__janggi!.snapshot());
  expect(again.moves).toBe(1);
  expect(again.ai!.level).toBe(2);
  expect(again.ai!.mySide).toBe("han");
  expect(again.ai!.seed).toBe(SEED);
  expect(await page.getByTestId("last-move").textContent()).toBe(opening);
});

test("컴퓨터 대국의 포획도 같은 연출을 재생하고, 연출 중 AI 응답은 큐에 쌓인다", async ({
  page,
}) => {
  await startAiGame(page, { level: 1, mySide: "cho", seed: SEED });

  // 연출 클록을 테스트가 미리 쥔다 — 포획이 몇 수째에 터지든 t=0에서 멈춘다
  await page.evaluate(() => window.__janggi!.pauseCinematic());

  /**
   * 초 졸 a4를 a파일로 밀어 올린다. 앞이 비면 전진, 적이 서 있으면 포획 —
   * 초 기물은 1~4선에만 있으므로 자기 편이 행진을 막을 수는 없다. 한의 응수는
   * seed로 고정되어 있으므로 어느 수에서 포획이 터지는지도 결정적이다.
   */
  const march = ["a4", "a5", "a6", "a7", "a8", "a9", "a10"];
  let captured = false;
  for (let i = 0; i < march.length - 1 && !captured; i += 1) {
    const played = await page.evaluate(
      (step) => {
        window.__janggi!.play(step[0], step[1]);
        return window.__janggi!.snapshot();
      },
      [march[i], march[i + 1]],
    );
    expect(
      played.moves,
      `${march[i]}→${march[i + 1]} 가 거부되었다 (졸이 잡혔거나 기보가 어긋났다)`,
    ).toBe(i * 2 + 1);

    if (played.cinematic === "cinematic") {
      captured = true; // 사람이 잡았다 — AI 응답은 연출 뒤로 밀린다
      break;
    }

    await page.waitForFunction(
      () => {
        const s = window.__janggi!.snapshot();
        if (s.result !== null || s.cinematic === "cinematic") return true;
        return s.ai !== null && !s.ai.thinking && !s.ai.pending;
      },
      undefined,
      { timeout: 30_000 },
    );
    const settled = await page.evaluate(() => window.__janggi!.snapshot());
    if (settled.cinematic === "cinematic") captured = true; // AI가 잡았다
    if (settled.result !== null) break;
  }

  expect(captured, "a파일 행진 중 포획이 발생하지 않았다").toBe(true);

  const frozen = await page.evaluate(() => window.__janggi!.snapshot());
  expect(frozen.cinematic).toBe("cinematic");
  expect(frozen.lastCapture).not.toBeNull();
  // 사람 수와 동일한 Tier 2 연출 경로 (P4) 를 탄다
  expect(frozen.variant).not.toBeNull();
  expect(frozen.captorType).not.toBeNull();

  // 타격 직후 — 1.2s의 플래시가 걷히고 공격 잔상이 남는 지점 (P4 촬영 규약)
  await seekCinematic(page, 1.38);
  await settleScene(page, 700);
  await page.screenshot({ path: path.join(ARTIFACTS, "p7-ai-game.png") });

  /**
   * 연출을 실제 시간으로 되돌려 끝까지 흘려보내면 대기 중이던 AI의 수가
   * 이어서 적용된다. 여기서 `finishCinematic`(seek 점프)을 쓰지 않는 이유:
   * 큐에서 나온 AI의 수가 또 포획이면 **두 번째 연출**이 곧바로 시작되는데,
   * 수동 클록에서는 그 연출이 t=0에 얼어붙어 영원히 끝나지 않는다.
   */
  const pendingAi = frozen.ai!.pending || frozen.turn !== "cho";
  await page.evaluate(() => window.__janggi!.resumeCinematic());
  await waitMyTurn(page);

  const resumed = await page.evaluate(() => window.__janggi!.snapshot());
  expect(resumed.cinematic).toBe("idle");
  expect(resumed.ai!.pending).toBe(false);
  expect(resumed.ai!.thinking).toBe(false);
  // 혈흔 데칼이 남는다 (gore 기본 ON) — 연출이 끝까지 재생됐다는 증거
  expect(resumed.decals).toBeGreaterThan(0);
  if (pendingAi) {
    expect(resumed.moves).toBeGreaterThan(frozen.moves);
  }

  // 연출이 끝나면 입력 잠금이 풀린다
  if (resumed.result === null) {
    await expect(page.getByTestId("pass-button")).toBeEnabled();
  }
});
