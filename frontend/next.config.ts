import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "@coinbase/cdp-sdk": "./src/lib/cdp-sdk-stub.ts",
    },
  },
};

export default nextConfig;
