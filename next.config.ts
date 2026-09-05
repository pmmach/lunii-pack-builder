import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Évite que Next.js prenne un package-lock.json parent (ex. C:\Users\minh) comme racine
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
