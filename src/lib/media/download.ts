import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { debugMedia, safeHost } from "@/lib/shared/debug-media";
import { env } from "@/lib/shared/env";
import { err, ok, type Result } from "@/lib/shared/result";
import { assertSafeUrl } from "@/lib/sources/url-guard";
import type { DownloadResult } from "./types";

/** Timeout images : plus court (fichiers petits). Audio : env.DOWNLOAD_TIMEOUT_MS. */
const IMAGE_DOWNLOAD_TIMEOUT_MS = 60_000;

function isAbortError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return (
    e.name === "AbortError" ||
    e.message.includes("aborted") ||
    e.message.includes("AbortError")
  );
}

export async function downloadToWorkspace(
  url: string,
  destPath: string,
  kind: "audio" | "image"
): Promise<Result<DownloadResult>> {
  const safe = await assertSafeUrl(url);
  if (!safe.ok) return safe;

  const host = safeHost(safe.data.toString());
  const timeoutMs =
    kind === "audio" ? env.DOWNLOAD_TIMEOUT_MS : IMAGE_DOWNLOAD_TIMEOUT_MS;
  const t0 = Date.now();
  debugMedia("download:start", { kind, host, timeoutMs });

  const controller = new AbortController();
  let timeout = setTimeout(() => controller.abort(), timeoutMs);
  const bumpTimeout = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => controller.abort(), timeoutMs);
  };

  try {
    const response = await fetch(safe.data.toString(), {
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent":
          "LuniiPackBuilder/0.1 (+https://github.com/pmmach/lunii-pack-builder)",
      },
    });

    if (!response.ok) {
      debugMedia("download:http-error", {
        kind,
        host,
        status: response.status,
        ms: Date.now() - t0,
      });
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
          mimeType === "audio/mp4" ||
          mimeType === "audio/x-m4a" ||
          mimeType === "")) ||
      (kind === "image" &&
        (mimeType === "application/octet-stream" ||
          mimeType === "image/webp" ||
          mimeType === ""));

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
        // Relance le timeout tant que des octets arrivent (stall vs durée totale).
        bumpTimeout();
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
      if (isAbortError(e) || controller.signal.aborted) {
        debugMedia("download:timeout", {
          kind,
          host,
          ms: Date.now() - t0,
          limitMs: timeoutMs,
          bytes: downloaded,
        });
        return err("Délai dépassé lors du téléchargement", "TIMEOUT");
      }
      debugMedia("download:stream-error", {
        kind,
        host,
        ms: Date.now() - t0,
        bytes: downloaded,
      });
      return err("Échec du téléchargement", "DOWNLOAD_FAILED");
    }

    debugMedia("download:ok", {
      kind,
      host,
      bytes: downloaded,
      ms: Date.now() - t0,
    });
    return ok({
      filePath: destPath,
      mimeType: mimeType || (kind === "audio" ? "audio/mpeg" : "image/jpeg"),
      sizeBytes: downloaded,
    });
  } catch (e) {
    if (isAbortError(e) || controller.signal.aborted) {
      debugMedia("download:timeout", {
        kind,
        host,
        ms: Date.now() - t0,
        limitMs: timeoutMs,
      });
      return err("Délai dépassé lors du téléchargement", "TIMEOUT");
    }
    debugMedia("download:failed", { kind, host, ms: Date.now() - t0 });
    return err("Impossible de télécharger le fichier", "DOWNLOAD_FAILED");
  } finally {
    clearTimeout(timeout);
  }
}
