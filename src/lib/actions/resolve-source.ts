"use server";

import { randomUUID } from "node:crypto";
import { classifySourceKind } from "@/lib/stats/source-kind";
import { recordUsage } from "@/lib/stats/usage";
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
  if (!limited.ok) {
    recordUsage({ type: "rate_limited", visitorIp: ip, bucket: "resolve" });
    return limited;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    recordUsage({
      type: "resolve",
      visitorIp: ip,
      ok: false,
      sourceKind: "autre",
      errorCode: "INVALID_URL",
    });
    return err("L'URL est obligatoire", "INVALID_URL");
  }

  const result = await resolvePodcastSource(trimmed);
  if (!result.ok) {
    recordUsage({
      type: "resolve",
      visitorIp: ip,
      ok: false,
      sourceKind: classifySourceKind(trimmed),
      errorCode: result.code ?? "UNKNOWN",
    });
    return result;
  }

  recordUsage({
    type: "resolve",
    visitorIp: ip,
    ok: true,
    sourceKind: classifySourceKind(trimmed, result.data.resolvedFrom),
  });

  return ok({
    ...result.data,
    sessionId: randomUUID(),
  });
}
