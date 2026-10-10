"use server";

import path from "node:path";
import { writePackToDisk } from "@/lib/pack/write-to-disk";
import { zipPackDirectory } from "@/lib/pack/zip";
import type { PackDraft } from "@/lib/pack/types";
import { recordUsage } from "@/lib/stats/usage";
import { getClientIp } from "@/lib/shared/client-ip";
import { checkRateLimit } from "@/lib/shared/rate-limit";
import { err, ok, type Result } from "@/lib/shared/result";
import {
  isValidSessionId,
  sessionWorkspaceRoot,
} from "@/lib/shared/session-id";

export async function exportPackAction(
  pack: PackDraft
): Promise<Result<{ downloadUrl: string; sizeBytes: number }>> {
  const ip = await getClientIp();
  const limited = checkRateLimit(ip, "export");
  if (!limited.ok) {
    recordUsage({ type: "rate_limited", visitorIp: ip, bucket: "export" });
    return limited;
  }

  if (!isValidSessionId(pack.sessionId)) {
    recordUsage({
      type: "export",
      visitorIp: ip,
      ok: false,
      errorCode: "INVALID_SESSION",
    });
    return err("Session invalide", "INVALID_SESSION");
  }

  const workspaceDir = sessionWorkspaceRoot(pack.sessionId);
  const packDest = path.join(workspaceDir, "pack");
  const zipPath = path.join(workspaceDir, "export.zip");

  const written = await writePackToDisk(pack, packDest);
  if (!written.ok) {
    recordUsage({
      type: "export",
      visitorIp: ip,
      ok: false,
      errorCode: written.code ?? "UNKNOWN",
    });
    return written;
  }

  const zipped = await zipPackDirectory(written.data.packDir, zipPath);
  if (!zipped.ok) {
    recordUsage({
      type: "export",
      visitorIp: ip,
      ok: false,
      errorCode: zipped.code ?? "UNKNOWN",
    });
    return zipped;
  }

  const packSlug = path.basename(written.data.packDir);
  const metaPath = path.join(workspaceDir, "export-meta.json");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    metaPath,
    JSON.stringify({ packSlug, zipPath, stories: pack.stories.length }),
    "utf-8"
  );

  recordUsage({
    type: "export",
    visitorIp: ip,
    ok: true,
    stories: pack.stories.length,
  });

  return ok({
    downloadUrl: `/api/download/${pack.sessionId}`,
    sizeBytes: zipped.data.sizeBytes,
  });
}
