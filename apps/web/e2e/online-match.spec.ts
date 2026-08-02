import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import captureGame from "./fixtures/capture-game.json";
import { ARTIFACTS, settleScene } from "./helpers";

/**
 * P5 게이트 — 온라인 1:1 대국을 브라우저 컨텍스트 2개로 완주한다.
 *
 * 서버는 playwright.config.ts의 webServer[0]이 띄운다 (NestJS + socket.io).
 * 검증 축:
 *   1. 방 만들기 → 방 코드 → 상대 입장 → 양측 대국 시작
 *   2. 서버 권위: 상대 차례에는 입력이 잠기고, 판은 game:state로만 바뀐다
 *   3. 포획 시 P3 연출이 *양측 모두* 에서 재생된다 (lastAction.captured 기반)
 *   4. 항복 → 양측 결과 화면 (서버 판정 resign)
 *
 * Artifacts:
 *   p5-online-1.png        대기실 (방 코드 + 상대 대기)
 *   p5-online-2.png        초 시점 대국 중
 *   p5-online-2-han.png    한 시점 대국 중 (카메라 반대편)
 *   p5-online-capture.png  포획 연출 재생 중 (수신 측)
 *   p5-online-3.png        결과 화면
 */

const MOVES = captureGame.moves as { from: string; to: string }[];

async function enterLobby(
  page: Page,
  intent: "create" | "join",
  nickname: string,
) {
  await page.goto("/");
  await expect(page.getByTestId("title-screen")).toBeVisible();
  await page
    .getByTestId(intent === "create" ? "online-create-button" : "online-join-button")
    .click();
  await expect(page.getByTestId("online-lobby")).toBeVisible();
  await page.getByTestId("nickname-input").fill(nickname);
}

/** 대국 화면 + 테스트 브리지가 준비될 때까지. */
async function waitInMatch(page: Page) {
  await expect(page.getByTestId("game-screen")).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__janggi), undefined, {
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => window.__janggi!.snapshot().online?.status === "playing",
    undefined,
    { timeout: 30_000 },
  );
}

/** 서버 스냅샷이 화면에 반영될 때까지 (실시간 대기가 아니라 상태 기반). */
async function awaitPly(page: Page, ply: number) {
  await page.waitForFunction(
    (target) => (window.__janggi!.snapshot().online?.ply ?? -1) >= target,
    ply,
    { timeout: 30_000 },
  );
}

test("온라인 1:1 대국 — 방 생성 · 코드 입장 · 포획 연출 · 항복 종료", async ({
  browser,
}) => {
  test.setTimeout(300_000);

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage(); // 초 (방장)
  const guest = await guestContext.newPage(); // 한

  try {
    /* ── 1. 방 만들기 → 대기실 ───────────────────────────────────── */
    await enterLobby(host, "create", "초선수");
    await host.getByTestId("create-room-button").click();

    const codeBadge = host.getByTestId("room-code");
    await expect(codeBadge).toBeVisible();
    await expect(host.getByTestId("waiting-banner")).toBeVisible();
    const roomCode = ((await codeBadge.textContent()) ?? "").trim();
    expect(roomCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    await host.screenshot({ path: path.join(ARTIFACTS, "p5-online-1.png") });

    /* ── 2. 방 코드로 입장 → 양측 대국 시작 ───────────────────────── */
    await enterLobby(guest, "join", "한후수");
    await guest.getByTestId("room-code-input").fill(roomCode);
    await guest.getByTestId("join-room-button").click();

    await waitInMatch(host);
    await waitInMatch(guest);

    await expect(host.getByTestId("game-screen")).toHaveAttribute(
      "data-my-side",
      "cho",
    );
    await expect(guest.getByTestId("game-screen")).toHaveAttribute(
      "data-my-side",
      "han",
    );
    // 방 코드 · 상대 닉네임 · 턴 시계 (turnDeadline 기반 카운트다운)
    await expect(host.getByTestId("room-code-badge")).toContainText(roomCode);
    await expect(host.getByTestId("online-players")).toContainText("한후수");
    await expect(guest.getByTestId("online-players")).toContainText("초선수");
    await expect(host.getByTestId("turn-clock")).toBeVisible();

    /* ── 3. 서버 권위: 상대 차례에는 입력이 잠긴다 ────────────────── */
    const blocked = await guest.evaluate(() => {
      window.__janggi!.play("a7", "a6"); // 한의 합법 수지만 지금은 초 차례
      const s = window.__janggi!.snapshot();
      return { ply: s.online?.ply ?? -1, selected: s.selected };
    });
    expect(blocked.ply).toBe(0);
    expect(blocked.selected).toBeNull();

    /* ── 4. 교대로 7수 — 마지막 수가 포획 (초 車 a1→a7) ───────────── */
    for (const [i, move] of MOVES.entries()) {
      const mover = i % 2 === 0 ? host : guest;
      const watcher = i % 2 === 0 ? guest : host;
      const capturing = i === MOVES.length - 1;

      if (capturing) {
        // 연출 시계를 테스트가 쥔다: 2.9초 타임라인이 폴링보다 먼저
        // 끝나버리는 레이스를 없앤다 (helpers.ts와 동일한 기법)
        await host.evaluate(() => window.__janggi!.pauseCinematic());
        await guest.evaluate(() => window.__janggi!.pauseCinematic());
      }

      await mover.evaluate((m) => window.__janggi!.play(m.from, m.to), move);
      await awaitPly(mover, i + 1);
      await awaitPly(watcher, i + 1);

      if (!capturing) {
        expect(
          (await mover.evaluate(() => window.__janggi!.snapshot())).cinematic,
        ).toBe("idle");
      }
    }

    /* ── 5. 포획 연출은 둔 쪽과 받은 쪽 모두에서 재생된다 ─────────── */
    for (const page of [host, guest]) {
      const snap = await page.evaluate(() => window.__janggi!.snapshot());
      expect(snap.cinematic, "포획 연출이 시작되지 않았다").toBe("cinematic");
      expect(snap.lastCapture?.type).toBe("soldier");
      expect(snap.lastCapture?.side).toBe("han");
      expect(snap.captorType).toBe("chariot");
      expect(snap.variant).not.toBeNull();
    }
    // 타격 직후 프레임을 받는 쪽(한) 화면으로 남긴다
    await guest.evaluate(() => window.__janggi!.seekCinematic(1.3));
    await guest.waitForFunction(
      () => window.__janggi!.snapshot().cinematicT >= 1.29,
      undefined,
      { timeout: 15_000 },
    );
    await guest.screenshot({
      path: path.join(ARTIFACTS, "p5-online-capture.png"),
    });

    /* ── 6. 연출 중 도착한 스냅샷은 큐잉되었다가 연출 후 반영된다 ──── */
    // 한만 연출을 넘기고 한수쉼을 둔다. 초는 아직 연출을 보고 있다.
    await guest.evaluate(() => {
      window.__janggi!.skipCinematic();
      window.__janggi!.resumeCinematic();
    });
    await guest.waitForFunction(
      () => window.__janggi!.snapshot().cinematic === "idle",
      undefined,
      { timeout: 15_000 },
    );
    await guest.getByTestId("pass-button").click(); // 온라인에서는 game:pass 전송
    await awaitPly(guest, MOVES.length + 1);

    await host.waitForFunction(
      () => (window.__janggi!.snapshot().online?.pending ?? 0) > 0,
      undefined,
      { timeout: 20_000 },
    );
    const held = await host.evaluate(() => window.__janggi!.snapshot());
    expect(held.cinematic, "연출이 끝나기 전에 화면이 바뀌었다").toBe("cinematic");
    expect(held.online?.ply).toBe(MOVES.length);
    expect(held.online?.pending).toBe(1);

    await host.evaluate(() => {
      window.__janggi!.skipCinematic();
      window.__janggi!.resumeCinematic();
    });
    await awaitPly(host, MOVES.length + 1);
    await expect(host.getByTestId("last-move")).toContainText("한 한수쉼");
    expect(
      (await host.evaluate(() => window.__janggi!.snapshot())).online?.pending,
    ).toBe(0);

    // 잡힌 말 목록은 서버 스냅샷의 captured에서 온다
    await expect(host.getByTestId("captured-cho")).toHaveAttribute(
      "data-total",
      "1",
    );
    await expect(guest.getByTestId("captured-cho")).toHaveAttribute(
      "data-total",
      "1",
    );

    await settleScene(host, 1500);
    await settleScene(guest, 1500);
    await host.screenshot({ path: path.join(ARTIFACTS, "p5-online-2.png") });
    await guest.screenshot({
      path: path.join(ARTIFACTS, "p5-online-2-han.png"),
    });

    /* ── 7. 항복 (브라우저 confirm 아님 — 자체 확인 오버레이) ─────── */
    await guest.getByTestId("resign-button").click();
    await expect(guest.getByTestId("resign-confirm")).toBeVisible();
    await guest.getByTestId("resign-confirm-no").click();
    await expect(guest.getByTestId("resign-confirm")).toHaveCount(0);

    await guest.getByTestId("resign-button").click();
    await guest.getByTestId("resign-confirm-yes").click();

    for (const page of [host, guest]) {
      await expect(page.getByTestId("result-overlay")).toBeVisible();
      await expect(page.getByTestId("result-title")).toHaveText("초 승");
      await expect(page.getByTestId("result-detail")).toContainText("한 기권");
      await expect(page.getByTestId("game-screen")).toHaveAttribute(
        "data-result",
        "resign",
      );
    }
    await expect(host.getByTestId("result-overlay")).toHaveAttribute(
      "data-outcome",
      "win",
    );
    await expect(guest.getByTestId("result-overlay")).toHaveAttribute(
      "data-outcome",
      "lose",
    );

    await host.screenshot({ path: path.join(ARTIFACTS, "p5-online-3.png") });

    /* ── 8. 방 나가기 → 타이틀 ────────────────────────────────────── */
    await host.getByTestId("result-leave-button").click();
    await expect(host.getByTestId("title-screen")).toBeVisible();
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test("상대 연결이 끊기면 배너가 뜨지만 대국은 계속된다", async ({ browser }) => {
  test.setTimeout(180_000);

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  let guestClosed = false;

  try {
    await enterLobby(host, "create", "남는쪽");
    await host.getByTestId("create-room-button").click();
    const roomCode = (
      (await host.getByTestId("room-code").textContent()) ?? ""
    ).trim();

    await enterLobby(guest, "join", "나가는쪽");
    await guest.getByTestId("room-code-input").fill(roomCode);
    await guest.getByTestId("join-room-button").click();
    await waitInMatch(host);
    await waitInMatch(guest);

    // 소켓 강제 종료 (재접속 복구는 PRD 3절 제외 항목)
    await guestContext.close();
    guestClosed = true;

    await expect(host.getByTestId("opponent-disconnected-banner")).toBeVisible();
    await expect(host.getByTestId("opponent-disconnected-banner")).toContainText(
      "나가는쪽",
    );

    // 대국은 중단되지 않는다 — 내 차례이므로 계속 둘 수 있다
    await host.evaluate(() => window.__janggi!.play("a4", "b4"));
    await awaitPly(host, 1);
    await expect(host.getByTestId("game-screen")).toHaveAttribute(
      "data-result",
      "playing",
    );
  } finally {
    await hostContext.close();
    if (!guestClosed) await guestContext.close();
  }
});

test("서버에 닿지 못하면 타이틀로 돌아가고, 로컬 대국은 그대로 동작한다", async ({
  page,
}) => {
  // `?server=`로 죽은 포트를 가리킨다 (CLAUDE.md 절대 규칙 7의 회귀 방지)
  await page.goto("/?server=http://127.0.0.1:9");
  await page.getByTestId("online-create-button").click();
  await page.getByTestId("nickname-input").fill("외톨이");
  await page.getByTestId("create-room-button").click();

  await expect(page.getByTestId("title-screen")).toBeVisible();
  await expect(page.getByTestId("online-error")).toContainText(
    "연결할 수 없습니다",
  );

  // 서버가 없어도 로컬 대국은 100% 동작한다
  await page.getByTestId("start-local-button").click();
  await expect(page.getByTestId("game-screen")).toBeVisible();
  await expect(page.getByTestId("game-screen")).toHaveAttribute(
    "data-mode",
    "local",
  );
  await page.waitForFunction(() => Boolean(window.__janggi));
  const played = await page.evaluate(() => {
    window.__janggi!.play("a4", "a5");
    return window.__janggi!.snapshot();
  });
  expect(played.moves).toBe(1);
  expect(played.turn).toBe("han");
});

test("로비 입력 검증 — 짧은 닉네임과 없는 방 코드는 토스트로 막힌다", async ({
  page,
}) => {
  await enterLobby(page, "join", "가");
  await page.getByTestId("room-code-input").fill("ABC234");
  await page.getByTestId("join-room-button").click();
  await expect(page.getByTestId("online-error")).toContainText("닉네임은 2~12자");

  // 유효한 닉네임 + 존재하지 않는 방 → 서버 에러 코드가 한국어로 표시된다
  await page.getByTestId("nickname-input").fill("나그네");
  await page.getByTestId("join-room-button").click();
  await expect(page.getByTestId("online-error")).toContainText("그런 방이 없습니다");
  // 로비에 머무른다 (연결 실패와 달리 재시도 가능)
  await expect(page.getByTestId("online-lobby")).toBeVisible();
});
