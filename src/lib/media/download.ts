import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { env } from "@/lib/shared/env";
import { err, ok, type Result } from "@/lib/shared/result";
import { assertSafeUrl } from "@/lib/sources/url-guard";
import type { DownloadResult } from "./types";

const DOWNLOAD_TIMEOUT_MS = 60_000;

export async function downloadToWorkspace(
  url: string,
  destPath: string,
  kind: "audio" | "image"
): Promise<Result<DownloadResult>> {
  const safe = await assertSafeUrl(url);
  if (!safe.ok) return safe;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(safe.data.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "LuniiPackBuilder/0.1 (+https://github.com/pmmach/lunii-pack-builder)",
      },
    });

    if (!response.ok) {
      return err(
        `Téléchargement échoué (${response.status})`,
        "HTTP_ERROR"
      );
    }

    const mimeType =
      response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const expectedPrefix = kind === "audio" ? "audio/" : "image/";
    const mimeOk =
      mimeType.startsWith(expectedPrefix) ||
      (kind === "audio" &&
        (mimeType === "application/octet-stream" ||
          mimeType === "application/mp4" ||
          mimeType === "")) ||
      (kind === "image" && mimeType === "application/octet-stream");

    if (!mimeOk) {
      return err(
        "Le fichier distant n'est pas au format attendu",
        "INVALID_CONTENT_TYPE"
      );
    }

    const maxBytes = env.MAX_DOWNLOAD_MB * 1024 * 1024;
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > maxBytes) {
      return err("Fichier trop volumineux", "FILE_TOO_LARGE");
    }

    if (!response.body) {
      return err("Réponse vide", "EMPTY_RESPONSE");
    }

    await mkdir(path.dirname(destPath), { recursive: true });

    const nodeStream = Readable.fromWeb(
      response.body as import("node:stream/web").ReadableStream
    );

    let downloaded = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        downloaded += (chunk as Buffer).length;
        if (downloaded > maxBytes) {
          cb(new Error("FILE_TOO_LARGE"));
          return;
        }
        cb(null, chunk);
      },
    });

    try {
      await pipeline(nodeStream, counter, createWriteStream(destPath));
    } catch (e) {
      await unlink(destPath).catch(() => undefined);
      if (e instanceof Error && e.message === "FILE_TOO_LARGE") {
        return err("Fichier trop volumineux", "FILE_TOO_LARGE");
      }
      return err("Échec du téléchargement", "DOWNLOAD_FAILED");
    }

    return ok({
      filePath: destPath,
      mimeType: mimeType || (kind === "audio" ? "audio/mpeg" : "image/jpeg"),
      sizeBytes: downloaded,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return err("Délai dépassé lors du téléchargement", "TIMEOUT");
    }
    return err("Impossible de télécharger le fichier", "DOWNLOAD_FAILED");
  } finally {
    clearTimeout(timeout);
  }
}
