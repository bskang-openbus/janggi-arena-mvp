import { defineConfig, devices } from "@playwright/test";

// Overridable so parallel agents / dev servers don't fight over a port.
const PORT = Number(process.env.WEB_PORT ?? 3002);
const BASE_URL = `http://localhost:${PORT}`;

/**
 * 온라인 대국 서버 (P5).
 *
 * 규칙상 API 포트 = 프론트 − 1 (3001) 이지만 이 머신에서는 다른 프로젝트가
 * 3001을 점유하고 있어 빈 포트로 옮겼다 (CLAUDE.md 포트 충돌 회피 우선).
 * `SERVER_PORT` 로 덮어쓸 수 있다.
 */
const SERVER_PORT = Number(process.env.SERVER_PORT ?? 3003);
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

/**
 * E2E에서는 1수 제한을 3분으로 늘린다. 기본 60초는 SwiftShader에서 한 판을
 * 두는 동안 서버가 자동 한수쉼을 끼워 넣을 수 있어(수마다 3D 프레임을 기다린다)
 * 기보가 어긋난다. 시계 표시·경고 UI는 그대로 검증된다.
 */
const E2E_TURN_TIMEOUT_MS = process.env.TURN_TIMEOUT_MS ?? "180000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  /**
   * SwiftShader renders the R3F scene on the CPU, so a spec that replays a
   * 로 기보 + drives a 2.9s cinematic + writes five canvas screenshots swings
   * between ~12s and ~31s depending on machine load. The 30s default sat right
   * on that boundary and produced a different flaky test every run. This is an
   * unattended nightly build — a generous ceiling costs nothing when green and
   * buys a real signal when red.
   */
  timeout: 120_000,
  /**
   * Assertion budget, deliberately generous for the same reason as `timeout`.
   *
   * At 15s this fired spuriously on `startLocalGame` — the very first
   * `toBeVisible` after a cold `page.goto` against the Next dev server, on a
   * machine that happened to be running twenty other dev servers. The test had
   * 120s left, but the assertion gave up after 15s and failed the run.
   * Splitting the two budgets that far apart meant a single slow navigation
   * could fail a test that was nowhere near its own limit.
   */
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      // engine dist 빌드 + tsc → node dist/main.js (PROTOCOL.md 11절)
      command: "pnpm --filter server build && pnpm --filter server start",
      url: `${SERVER_URL}/health`,
      cwd: "../..",
      env: {
        PORT: String(SERVER_PORT),
        HOST: "127.0.0.1",
        TURN_TIMEOUT_MS: E2E_TURN_TIMEOUT_MS,
        // CORS: 웹 오리진만 허용 — 기본값(전체 허용)에 기대지 않는다
        CORS_ORIGIN: BASE_URL,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm dev",
      url: BASE_URL,
      env: {
        WEB_PORT: String(PORT),
        NEXT_PUBLIC_SERVER_URL: SERVER_URL,
        NEXT_PUBLIC_E2E: "1",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
