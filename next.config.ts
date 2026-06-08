import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node:sqlite is a built-in; keep it external so the bundler never tries to bundle it.
  serverExternalPackages: ["node:sqlite"],
};

export default nextConfig;
