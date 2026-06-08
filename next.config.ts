import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node:sqlite is a built-in; keep it external so the bundler never tries to bundle it.
  serverExternalPackages: ["node:sqlite"],

  // Allow kinsing.de to embed the /track page in an iframe.
  async headers() {
    return [
      {
        source: "/track",
        headers: [
          {
            key: "X-Frame-Options",
            value: "ALLOW-FROM https://www.kinsing.de",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://www.kinsing.de https://kinsing.de",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
