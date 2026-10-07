import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
  // Les binaires plateforme sont des optionalDependencies chargés dynamiquement :
  // le tracer standalone ne les voit pas → MODULE_NOT_FOUND en prod Docker.
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/@ffmpeg-installer/**/*",
      "./node_modules/@ffprobe-installer/**/*",
    ],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  serverExternalPackages: [
    "fluent-ffmpeg",
    "@ffmpeg-installer/ffmpeg",
    "@ffprobe-installer/ffprobe",
    "sharp",
    "edge-tts-universal",
  ],
};

export default nextConfig;
