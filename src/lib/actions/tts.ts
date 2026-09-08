"use server";

import path from "node:path";
import { getClientIp } from "@/lib/shared/client-ip";
import { env } from "@/lib/shared/env";
import { checkRateLimit } from "@/lib/shared/rate-limit";
import { err, ok, type Result } from "@/lib/shared/result";
import { isTtsConfigured, synthesizeTitle } from "@/lib/tts";

export async function getTtsStatusAction(): Promise<
  Result<{ configured: boolean; provider: string }>
> {
  return ok({
    configured: isTtsConfigured(),
    provider: env.TTS_PROVIDER,
  });
}

export async function synthesizeTitleAction(
  sessionId: string,
  text: string
): Promise<Result<{ url: string; cacheHit: boolean }>> {
  const ip = await getClientIp();
  const limited = checkRateLimit(ip, "tts");
  if (!limited.ok) return limited;

  if (!sessionId || sessionId.includes("..")) {
    return err("Session invalide", "INVALID_SESSION");
  }

  const result = await synthesizeTitle({ sessionId, text });
  if (!result.ok) return result;

  const hash = path.basename(result.data.filePath, ".mp3");
  return ok({
    url: `/api/workspace/${sessionId}/tts/${hash}.mp3`,
    cacheHit: result.data.cacheHit,
  });
}
