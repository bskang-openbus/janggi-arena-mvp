import path from "node:path";
import { expect, test } from "@playwright/test";
import cannonGame from "./fixtures/p4-cannon.json";
import chariotGame from "./fixtures/p4-chariot.json";
import elephantGame from "./fixtures/p4-elephant.json";
import generalGame from "./fixtures/p4-general.json";
import guardGame from "./fixtures/p4-guard.json";
import horseGame from "./fixtures/p4-horse.json";
import soldierGame from "./fixtures/p4-soldier.json";
import mateGame from "./fixtures/mate-game.json";
import {
  ARTIFACTS,
  type Fixture,
  finishCinematic,
  playCapturePaused,
  playMoves,
  seekCinematic,
  settleScene,
  startLocalGame,
  type Step,
} from "./helpers";

/**
 * P4 gate — Tier 2 기물별 고유 연출 7종 (docs/SCENES.md 3절).
 *
 * Each variant replaces only the 0.8s~1.2s attack window of the Tier 1
 * timeline, so the interesting frame is *not* the same moment for all seven:
 * 포's shell is mid-flight before the impact, 마 hangs at its apex, 사's blades
 * converge just short of it. `shotAt` is therefore per variant — the second at
 * which that attack looks like nothing else on the list.
 *
 * Artifacts: artifacts/p4-<기물>.png ×7 + p4-victory.png
 */

interface Tier2Case {
  /** 기물 이름 (스크린샷 파일명) */
  slug: string;
  label: string;
  fixture: Fixture;
  /** engine piece type that makes the capture */
  captorType: string;
  /** registered attack-variant id */
  variant: string;
  /** cinematic second whose frame is this attack's signature */
  shotAt: number;
}

const CASES: Tier2Case[] = [
  {
    slug: "soldier",
    label: "졸·병 창격",
    fixture: soldierGame as Fixture,
    captorType: "soldier",
    variant: "spear",
    shotAt: 1.16, // 장창 3자루가 모두 꽂힌 순간 (타격 플래시 직전)
  },
  {
    slug: "chariot",
    label: "차 돌진 참격",
    fixture: chariotGame as Fixture,
    captorType: "chariot",
    variant: "charge",
    shotAt: 1.36, // X자 슬래시 아크 + 잔상 (플래시가 걷힌 뒤)
  },
  {
    slug: "cannon",
    label: "포 포격",
    fixture: cannonGame as Fixture,
    captorType: "cannon",
    variant: "bombard",
    shotAt: 1.14, // 포탄이 표적으로 떨어지는 순간
  },
  {
    slug: "horse",
    label: "마 도약 강습",
    fixture: horseGame as Fixture,
    captorType: "horse",
    variant: "leap",
    shotAt: 1.02, // 도약 정점
  },
  {
    slug: "elephant",
    label: "상 진각 내려찍기",
    fixture: elephantGame as Fixture,
    captorType: "elephant",
    variant: "stomp",
    shotAt: 1.38, // 방사형 균열이 뻗어나간 뒤
  },
  {
    slug: "guard",
    label: "사 호위검",
    fixture: guardGame as Fixture,
    captorType: "guard",
    variant: "wardblade",
    shotAt: 1.14, // 검막이 수렴하는 순간
  },
  {
    slug: "general",
    label: "궁 왕의 위엄",
    fixture: generalGame as Fixture,
    captorType: "general",
    variant: "royal",
    shotAt: 1.4, // 광휘의 기둥
  },
];

test("7종 기물이 각각 다른 Tier 2 연출로 포획한다", async ({ page }) => {
  await startLocalGame(page);

  const seen = new Map<string, string>();

  for (const c of CASES) {
    // one page, one WebGL context: 재시작으로 국면만 초기화한다
    await page.evaluate(() => window.__janggi!.restart());
    const steps = c.fixture.moves as Step[];
    const setup = steps.slice(0, -1);
    const capture = steps[steps.length - 1] as { from: string; to: string };

    await playMoves(page, setup);
    const entered = await playCapturePaused(page, capture);

    expect(entered.captorType, `${c.label}: 포획 기물 종류`).toBe(c.captorType);
    expect(entered.variant, `${c.label}: 연출 variant`).toBe(c.variant);
    seen.set(c.captorType, entered.variant!);

    await seekCinematic(page, c.shotAt);
    await page.screenshot({
      path: path.join(ARTIFACTS, `p4-${c.slug}.png`),
    });

    const shot = await page.evaluate(() => ({
      frame: window.__janggi!.sampleFrame(),
      t: window.__janggi!.snapshot().cinematicT,
    }));
    expect(shot.t, `${c.label}: 캡처 시각`).toBeCloseTo(c.shotAt, 3);
    // 빈 화면(전부 검정/전부 흰색)이 아니어야 한다
    expect(shot.frame!.mean, `${c.label}: 평균 휘도`).toBeGreaterThan(4);
    expect(shot.frame!.mean, `${c.label}: 평균 휘도`).toBeLessThan(235);
    expect(shot.frame!.colored, `${c.label}: 유채색 픽셀`).toBeGreaterThan(0.015);

    await finishCinematic(page);
  }

  // 게이트의 핵심: 7종이 서로 다른 연출을 쓴다
  expect(seen.size).toBe(7);
  expect(new Set(seen.values()).size, "중복된 연출이 있다").toBe(7);
});

test("외통 승리 연출이 문양·붓글씨·승자를 거쳐 결과 화면으로 넘어간다", async ({
  page,
}) => {
  await startLocalGame(page);

  const steps = mateGame.moves as Step[];
  await playMoves(page, steps.slice(0, -1));

  // 마지막 수(상 e4→g7)는 포획이자 외통이다 — 포획 연출이 먼저 끝나야
  // 승리 연출이 시작된다.
  await playCapturePaused(page, steps[steps.length - 1] as { from: string; to: string });
  await page.evaluate(() => window.__janggi!.skipCinematic());

  const started = await page.evaluate(() => window.__janggi!.snapshot());
  expect(started.result).toBe("checkmate");
  expect(started.victory, "포획 연출 종료 후 승리 연출이 이어져야 한다").toBe(
    "cho",
  );
  await expect(page.getByTestId("victory-overlay")).toBeVisible();
  // 승리 연출 중에는 결과 오버레이가 뜨지 않는다
  await expect(page.getByTestId("result-overlay")).toHaveCount(0);

  // 붓글씨 "외통"이 드러난 뒤 승자 표기가 올라오는 구간
  await page.evaluate(() => window.__janggi!.seekCinematic(1.85));
  await page.waitForFunction(
    () => window.__janggi!.snapshot().victoryT >= 1.84,
    undefined,
    { timeout: 10_000 },
  );
  await expect(page.getByTestId("victory-overlay")).toHaveAttribute(
    "data-beat",
    "winner",
  );
  await expect(page.getByTestId("victory-word")).toHaveText("외통");
  await expect(page.getByTestId("victory-winner")).toHaveText("초 승");
  await page.screenshot({ path: path.join(ARTIFACTS, "p4-victory.png") });

  const frame = await page.evaluate(() => window.__janggi!.sampleFrame());
  expect(frame!.mean).toBeGreaterThan(2);

  // 실시간으로 돌려주면 3.2s 뒤 결과 오버레이로 인계된다
  await page.evaluate(() => window.__janggi!.resumeCinematic());
  await expect(page.getByTestId("result-overlay")).toBeVisible();
  await expect(page.getByTestId("victory-overlay")).toHaveCount(0);
  await expect(page.getByTestId("result-title")).toHaveText("초 승");

  await settleScene(page, 300);
});

test("승리 연출 중 화면을 클릭하면 결과 화면으로 즉시 넘어간다", async ({
  page,
}) => {
  await startLocalGame(page);

  const steps = mateGame.moves as Step[];
  await playMoves(page, steps.slice(0, -1));
  await playCapturePaused(page, steps[steps.length - 1] as { from: string; to: string });
  await page.evaluate(() => window.__janggi!.skipCinematic());

  await expect(page.getByTestId("victory-overlay")).toBeVisible();
  await page
    .getByTestId("victory-overlay")
    .click({ position: { x: 40, y: 300 } });

  await expect(page.getByTestId("victory-overlay")).toHaveCount(0);
  await expect(page.getByTestId("result-overlay")).toBeVisible();
  await expect(page.getByTestId("result-title")).toHaveText("초 승");

  await page.evaluate(() => window.__janggi!.resumeCinematic());
});
