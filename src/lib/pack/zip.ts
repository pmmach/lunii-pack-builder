import { createWriteStream } from "node:fs";
import { createRequire } from "node:module";
import { stat } from "node:fs/promises";
import path from "node:path";
import { err, ok, type Result } from "@/lib/shared/result";

const require = createRequire(import.meta.url);
const archiver = require("archiver") as (
  format: string,
  options?: { zlib?: { level?: number } }
) => import("archiver").Archiver;

export async function zipPackDirectory(
  packDir: string,
  outputZipPath: string
): Promise<Result<{ zipPath: string; sizeBytes: number }>> {
  const packSlug = path.basename(packDir);

  try {
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(outputZipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => resolve());
      output.on("error", (e) => reject(e));
      archive.on("error", (e) => reject(e));
      archive.on("warning", (e) => {
        if (e.code !== "ENOENT") reject(e);
      });

      archive.pipe(output);
      archive.directory(packDir, packSlug);
      void archive.finalize();
    });

    const info = await stat(outputZipPath);
    return ok({ zipPath: outputZipPath, sizeBytes: info.size });
  } catch (e) {
    return err(
      e instanceof Error ? e.message : "Échec de la compression du pack",
      "ZIP_FAILED"
    );
  }
}
