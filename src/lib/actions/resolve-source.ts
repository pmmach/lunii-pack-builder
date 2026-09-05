"use server";

import { randomUUID } from "node:crypto";
import { err, ok, type Result } from "@/lib/shared/result";
import { resolvePodcastSource } from "@/lib/sources/resolve";
import type { SourceResolution } from "@/lib/sources/types";

export type ResolveSourceActionResult = SourceResolution & {
  sessionId: string;
};

export async function resolveSourceAction(
  rawUrl: string
): Promise<Result<ResolveSourceActionResult>> {
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
