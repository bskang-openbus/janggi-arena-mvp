import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const engineSrc = fileURLToPath(new URL("../../packages/engine/src/index.ts", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run straight off the engine sources, so `pnpm -F server test` needs no build step.
    // Production (`pnpm -F server build`) resolves the same specifier to packages/engine/dist.
    alias: [{ find: /^engine\/dist$/, replacement: engineSrc }],
  },
  server: {
    fs: { allow: [repoRoot] },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/testing/setup.ts"],
    watch: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
