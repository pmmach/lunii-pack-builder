"use server";

import { randomUUID } from "node:crypto";
import { getClientIp } from "@/lib/shared/client-ip";
import { checkRateLimit } from "@/lib/shared/rate-limit";
import { err, ok, type Result } from "@/lib/shared/result";
import { resolvePodcastSource } from "@/lib/sources/resolve";
import type { SourceResolution } from "@/lib/sources/types";

export type ResolveSourceActionResult = SourceResolution & {
  sessionId: string;
};

export async function resolveSourceAction(
  rawUrl: string
): Promise<Result<ResolveSourceActionResult>> {
  const ip = await getClientIp();
  const limited = checkRateLimit(ip, "resolve");
  if (!limited.ok) return limited;

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return err("L'URL est obligatoire", "INVALID_URL");
  }

  const result = await resolvePodcastSource(trimmed);
  if (!result.ok) return result;

  return ok({
    ...result.data,
    sessionId: randomUUID(),
  });
}
