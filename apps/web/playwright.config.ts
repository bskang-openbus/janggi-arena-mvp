import { defineConfig, devices } from "@playwright/test";

// Overridable so parallel agents / dev servers don't fight over a port.
const PORT = Number(process.env.WEB_PORT ?? 3002);
const BASE_URL = `http://localhost:${PORT}`;

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
  expect: { timeout: 15_000 },
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
  webServer: {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
