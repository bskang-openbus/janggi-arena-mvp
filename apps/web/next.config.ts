import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // keeps the dev overlay badge out of E2E screenshots
  devIndicators: false,
};

export default nextConfig;
