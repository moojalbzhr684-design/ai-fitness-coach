import { config as loadEnvironment } from "dotenv";
import { resolve } from "node:path";
import type { NextConfig } from "next";

loadEnvironment({ path: resolve(process.cwd(), "../../.env"), quiet: true });

const memberApiOrigin = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_MEMBER_API_URL ?? "http://localhost:3000").origin; }
  catch { return "http://localhost:3000"; }
})();

const nextConfig: NextConfig = {
  agentRules: false,
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "grammy"],
  webpack(config) {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${memberApiOrigin}; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` },
      ],
    }];
  },
};

export default nextConfig;
