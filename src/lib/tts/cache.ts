import { createHash } from "node:crypto";
import path from "node:path";

export function ttsCacheKey(parts: {
  provider: string;
  voice: string;
  language: string;
  text: string;
}): string {
  const payload = `${parts.provider}|${parts.voice}|${parts.language}|${parts.text}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function ttsCachePath(sessionId: string, hash: string): string {
  return path.join(process.cwd(), "workspace", sessionId, "tts", `${hash}.mp3`);
}
