"use server";

import path from "node:path";
import { writePackToDisk } from "@/lib/pack/write-to-disk";
import { zipPackDirectory } from "@/lib/pack/zip";
import type { PackDraft } from "@/lib/pack/types";
import { err, ok, type Result } from "@/lib/shared/result";

export async function exportPackAction(
  pack: PackDraft
): Promise<Result<{ downloadUrl: string; sizeBytes: number }>> {
  if (!pack.sessionId) {
    return err("Session invalide", "INVALID_SESSION");
  }

  const workspaceDir = path.join(process.cwd(), "workspace", pack.sessionId);
  const packDest = path.join(workspaceDir, "pack");
  const zipPath = path.join(workspaceDir, "export.zip");

  const written = await writePackToDisk(pack, packDest);
  if (!written.ok) return written;

  const zipped = await zipPackDirectory(written.data.packDir, zipPath);
  if (!zipped.ok) return zipped;

  // Mémoriser le slug pour le Content-Disposition
  const packSlug = path.basename(written.data.packDir);
  const metaPath = path.join(workspaceDir, "export-meta.json");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    metaPath,
    JSON.stringify({ packSlug, zipPath }),
    "utf-8"
  );

  return ok({
    downloadUrl: `/api/download/${pack.sessionId}`,
    sizeBytes: zipped.data.sizeBytes,
  });
}
