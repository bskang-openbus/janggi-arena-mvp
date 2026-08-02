import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
