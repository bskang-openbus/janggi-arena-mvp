import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Docker (P6). `standalone` emits `.next/standalone/**` with only the traced
   * runtime deps, so the image doesn't need pnpm or the workspace symlinks.
   * The tracing root is inferred from the repo-root `pnpm-lock.yaml`.
   * `pnpm dev`/`pnpm -F web e2e` are unaffected — this only adds build output.
   */
  output: "standalone",
  // keeps the dev overlay badge out of E2E screenshots
  devIndicators: false,
  // `engine` ships raw TypeScript (package.json main -> ./src/index.ts),
  // so Next has to compile it as part of the app.
  transpilePackages: ["engine"],
  webpack: (config) => {
    // engine's internal imports use the NodeNext-style ".js" suffix on .ts
    // files; webpack needs the alias to follow them.
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
