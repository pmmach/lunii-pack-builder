"use server";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { withConcurrencyLimit } from "@/lib/jobs/semaphore";
import {
  createJob,
  getJob,
  updateJob,
  type JobState,
} from "@/lib/jobs/tracker";
import { cropImageToSquare } from "@/lib/media/image";
import { downloadToWorkspace } from "@/lib/media/download";
import { ensureMp3, trimAudio } from "@/lib/media/trim";
import type { TrimOptions } from "@/lib/media/types";
import { generateWaveformPeaks } from "@/lib/media/waveform";
import { debugMedia } from "@/lib/shared/debug-media";
import { env } from "@/lib/shared/env";
import { err, ok, type Result } from "@/lib/shared/result";
import { slugify } from "@/lib/shared/slugify";
import type { EpisodeMeta } from "@/lib/sources/types";

const SOURCE_MP3_NAME = "source.mp3";

function workspaceRoot(sessionId: string): string {
  return path.join(process.cwd(), "workspace", sessionId);
}

function extensionFromUrl(url: string, fallback: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if (ext && ext.length <= 5) return ext;
  } catch {
    // ignore
  }
  return fallback;
}

/**
 * Déduplique les préparations concurrentes du même épisode (même session).
 * Sans cette garde, un double déclenchement côté client (remount React /
 * Fast Refresh en dev, double-clic, effet ré-exécuté) relance un second
 * téléchargement en parallèle du premier vers le même fichier disque, ce qui
 * casse les deux (écritures concurrentes + double requête vers la même URL
 * source). On réutilise le job existant tant qu'il n'est pas en erreur.
 */
const activeEpisodeJobs = new Map<string, string>();

export async function prepareEpisodeAction(
  sessionId: string,
  episode: EpisodeMeta
): Promise<Result<{ jobId: string }>> {
  if (
    episode.durationSeconds !== undefined &&
    episode.durationSeconds > env.MAX_EPISODE_DURATION_SECONDS
  ) {
    return err(
      "Cet épisode dépasse la durée maximale autorisée.",
      "EPISODE_TOO_LONG"
    );
  }

  const safeEpisodeId = slugify(episode.id) || "episode";
  const dedupeKey = `${sessionId}:${safeEpisodeId}`;
  const existingJobId = activeEpisodeJobs.get(dedupeKey);
  if (existingJobId) {
    const existing = getJob(existingJobId);
    if (existing && existing.status !== "error") {
      debugMedia("prepare:reuse", {
        episode: safeEpisodeId,
        jobId: existingJobId,
        status: existing.status,
      });
      return ok({ jobId: existingJobId });
    }
  }

  const jobId = createJob();
  activeEpisodeJobs.set(dedupeKey, jobId);
  updateJob(jobId, {
    status: "pending",
    progress: 0,
    message: "En file d'attente…",
  });
  debugMedia("prepare:queued", { episode: safeEpisodeId, jobId });

  void withConcurrencyLimit(async () => {
    const t0 = Date.now();
    try {
      const sourceDir = path.join(
        workspaceRoot(sessionId),
        "source",
        safeEpisodeId
      );
      const processedDir = path.join(
        workspaceRoot(sessionId),
        "processed",
        safeEpisodeId
      );
      await mkdir(sourceDir, { recursive: true });
      await mkdir(processedDir, { recursive: true });

      const audioExt = extensionFromUrl(episode.audioUrl, ".mp3");
      const audioPath = path.join(sourceDir, `audio${audioExt}`);

      updateJob(jobId, {
        status: "running",
        progress: 8,
        message: "Téléchargement de l'audio…",
      });
      const audioDl = await downloadToWorkspace(
        episode.audioUrl,
        audioPath,
        "audio",
        (ratio) => {
          const pct = Math.round(ratio * 100);
          updateJob(jobId, {
            progress: 8 + Math.round(ratio * 20),
            message: `Téléchargement de l'audio… ${pct}%`,
          });
        }
      );
      if (!audioDl.ok) {
        updateJob(jobId, {
          status: "error",
          message: audioDl.error,
          errorCode: audioDl.code,
        });
        return;
      }

      // Conversion unique m4a/etc. → MP3 : la découpe ultérieure sera une
      // copie de flux quasi instantanée au lieu d'un ré-encodage ~90s.
      const mp3Path = path.join(processedDir, SOURCE_MP3_NAME);
      updateJob(jobId, {
        progress: 30,
        message: "Conversion audio…",
      });
      const converted = await ensureMp3(audioPath, mp3Path, (percent) => {
        updateJob(jobId, {
          progress: 30 + Math.round((percent / 100) * 25),
          message: `Conversion audio… ${percent}%`,
        });
      });
      if (!converted.ok) {
        updateJob(jobId, {
          status: "error",
          message: converted.error,
          errorCode: converted.code,
        });
        return;
      }

      let coverSourcePath: string | undefined;
      if (episode.imageUrl) {
        updateJob(jobId, {
          progress: 58,
          message: "Téléchargement de l'image…",
        });
        const imageExt = extensionFromUrl(episode.imageUrl, ".jpg");
        coverSourcePath = path.join(sourceDir, `cover${imageExt}`);
        const imageDl = await downloadToWorkspace(
          episode.imageUrl,
          coverSourcePath,
          "image"
        );
        if (!imageDl.ok) {
          coverSourcePath = undefined;
        }
      }

      const coverOut = path.join(processedDir, "cover.jpg");
      updateJob(jobId, {
        progress: 65,
        message: "Recadrage de la vignette…",
      });
      if (coverSourcePath) {
        const cropped = await cropImageToSquare({
          sourcePath: coverSourcePath,
          outputPath: coverOut,
        });
        if (!cropped.ok) {
          coverSourcePath = undefined;
        }
      }
      if (!coverSourcePath) {
        // Vignette de secours uni-couleur si aucune image source
        const sharp = (await import("sharp")).default;
        await sharp({
          create: {
            width: 320,
            height: 320,
            channels: 3,
            background: { r: 13, g: 148, b: 136 },
          },
        })
          .jpeg({ quality: 85 })
          .toFile(coverOut);
      }

      updateJob(jobId, {
        progress: 80,
        message: "Génération de la forme d'onde…",
      });
      const peaks = await generateWaveformPeaks(mp3Path, 200);
      if (!peaks.ok) {
        updateJob(jobId, {
          status: "error",
          message: peaks.error,
          errorCode: peaks.code,
        });
        return;
      }

      // story.mp3 (découpe) est produit plus tard via trimEpisodeAction,
      // à partir de source.mp3 (copie de flux).
      updateJob(jobId, {
        status: "done",
        progress: 100,
        message: "Prêt",
        resultRef: JSON.stringify({
          episodeId: safeEpisodeId,
          audioPath: mp3Path,
          storyPath: mp3Path,
          coverPath: coverOut,
          peaks: peaks.data,
          durationSeconds: converted.data.durationSeconds,
        }),
      });
      debugMedia("prepare:done", {
        episode: safeEpisodeId,
        ext: path.extname(audioPath).toLowerCase() || "(none)",
        mp3: true,
        ms: Date.now() - t0,
      });
    } catch (e) {
      updateJob(jobId, {
        status: "error",
        message:
          e instanceof Error ? e.message : "Erreur inattendue de préparation",
        errorCode: "PREPARE_FAILED",
      });
      debugMedia("prepare:error", {
        episode: safeEpisodeId,
        ms: Date.now() - t0,
      });
    }
  }, `prepare:${safeEpisodeId}`);

  return ok({ jobId });
}

export async function getJobStatusAction(
  jobId: string
): Promise<Result<JobState>> {
  const job = getJob(jobId);
  if (!job) return err("Tâche introuvable", "JOB_NOT_FOUND");
  return ok(job);
}

function mapTrimFfmpegProgress(percent: number): number {
  const clamped = Math.min(100, Math.max(0, percent));
  return 10 + Math.round((clamped / 100) * 85);
}

export async function trimEpisodeAction(
  sessionId: string,
  episodeId: string,
  opts: TrimOptions
): Promise<Result<{ jobId: string }>> {
  const safeEpisodeId = slugify(episodeId) || "episode";
  const label = `trim:${safeEpisodeId}`;
  const jobId = createJob();
  updateJob(jobId, {
    status: "pending",
    progress: 0,
    message: "En file d'attente…",
  });
  debugMedia("trim:action-enter", {
    episode: safeEpisodeId,
    jobId,
    startSec: Math.round(opts.startSeconds * 10) / 10,
    endSec: Math.round(opts.endSeconds * 10) / 10,
  });

  void withConcurrencyLimit(async () => {
    const t0 = Date.now();
    try {
      updateJob(jobId, {
        status: "running",
        progress: 8,
        message: "Découpe audio…",
      });

      const sourceDir = path.join(
        workspaceRoot(sessionId),
        "source",
        safeEpisodeId
      );
      const processedDir = path.join(
        workspaceRoot(sessionId),
        "processed",
        safeEpisodeId
      );
      await mkdir(processedDir, { recursive: true });

      const { access, readdir, stat } = await import("node:fs/promises");
      const mp3Path = path.join(processedDir, SOURCE_MP3_NAME);
      let inputPath = mp3Path;
      let inputLabel = SOURCE_MP3_NAME;

      try {
        await access(mp3Path);
      } catch {
        // Fallback (anciennes sessions / prepare sans conversion) : audio brut.
        const files = await readdir(sourceDir).catch(() => [] as string[]);
        const audioFile = files.find((f) => f.startsWith("audio."));
        if (!audioFile) {
          debugMedia("trim:action-missing", { episode: safeEpisodeId });
          updateJob(jobId, {
            status: "error",
            message: "Audio source introuvable",
            errorCode: "SOURCE_MISSING",
          });
          return;
        }
        inputPath = path.join(sourceDir, audioFile);
        inputLabel = audioFile;
      }

      const outputPath = path.join(processedDir, "story.mp3");
      const fileStat = await stat(inputPath).catch(() => null);
      debugMedia("trim:action-run", {
        episode: safeEpisodeId,
        jobId,
        file: inputLabel,
        bytes: fileStat?.size ?? -1,
      });

      const result = await trimAudio(
        inputPath,
        outputPath,
        opts,
        (percent) => {
          const pct = Math.min(100, Math.round(percent));
          updateJob(jobId, {
            progress: mapTrimFfmpegProgress(pct),
            message: `Découpe audio… ${pct}%`,
          });
        }
      );
      if (!result.ok) {
        debugMedia("trim:action-fail", {
          episode: safeEpisodeId,
          ms: Date.now() - t0,
        });
        updateJob(jobId, {
          status: "error",
          message: result.error,
          errorCode: result.code,
        });
        return;
      }

      updateJob(jobId, {
        status: "done",
        progress: 100,
        message: "Découpée",
        resultRef: JSON.stringify({
          storyPath: result.data.filePath,
          durationSeconds: result.data.durationSeconds,
        }),
      });
      debugMedia("trim:action-ok", {
        episode: safeEpisodeId,
        outDurationSec: Math.round(result.data.durationSeconds * 10) / 10,
        ms: Date.now() - t0,
      });
    } catch (e) {
      updateJob(jobId, {
        status: "error",
        message:
          e instanceof Error ? e.message : "Erreur inattendue de découpe",
        errorCode: "TRIM_FAILED",
      });
      debugMedia("trim:action-fail", {
        episode: safeEpisodeId,
        ms: Date.now() - t0,
      });
    }
  }, label);

  return ok({ jobId });
}

export async function cropEpisodeCoverAction(
  sessionId: string,
  episodeId: string,
  focus?: { x: number; y: number }
): Promise<Result<{ path: string }>> {
  const safeEpisodeId = slugify(episodeId) || "episode";
  const sourceDir = path.join(
    workspaceRoot(sessionId),
    "source",
    safeEpisodeId
  );
  const processedDir = path.join(
    workspaceRoot(sessionId),
    "processed",
    safeEpisodeId
  );
  await mkdir(processedDir, { recursive: true });

  const { readdir } = await import("node:fs/promises");
  const files = await readdir(sourceDir).catch(() => [] as string[]);
  const coverFile = files.find((f) => f.startsWith("cover."));
  if (!coverFile) {
    return err("Image source introuvable", "SOURCE_MISSING");
  }

  const outputPath = path.join(processedDir, "cover.jpg");
  const result = await cropImageToSquare({
    sourcePath: path.join(sourceDir, coverFile),
    outputPath,
    focusX: focus?.x,
    focusY: focus?.y,
  });

  if (!result.ok) return result;
  return ok({ path: result.data.path });
}

const ALLOWED_PACK_COVER_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function coverExtFromMime(mime: string): string | undefined {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return undefined;
}

function isValidSessionId(sessionId: string): boolean {
  return (
    sessionId.length > 0 &&
    !sessionId.includes("..") &&
    !sessionId.includes("/") &&
    !sessionId.includes("\\")
  );
}

export async function uploadPackCoverAction(
  sessionId: string,
  formData: FormData
): Promise<Result<{ path: string; url: string }>> {
  if (!isValidSessionId(sessionId)) {
    return err("Session invalide", "INVALID_SESSION");
  }

  const entry = formData.get("file");
  if (!(entry instanceof Blob) || entry.size <= 0) {
    return err("Aucun fichier reçu.", "INVALID_IMAGE");
  }

  const mime = entry.type;
  const ext = coverExtFromMime(mime);
  if (!ext || !ALLOWED_PACK_COVER_TYPES.has(mime)) {
    return err(
      "Le fichier doit être une image JPEG, PNG ou WebP.",
      "INVALID_IMAGE_TYPE"
    );
  }

  const maxBytes = env.MAX_COVER_UPLOAD_MB * 1024 * 1024;
  if (entry.size > maxBytes) {
    return err(
      `Image trop volumineuse (max ${env.MAX_COVER_UPLOAD_MB} Mo).`,
      "FILE_TOO_LARGE"
    );
  }

  return withConcurrencyLimit(async () => {
    const coverDir = path.join(workspaceRoot(sessionId), "pack-cover");
    await mkdir(coverDir, { recursive: true });
    const srcPath = path.join(coverDir, `upload-src${ext}`);
    const outputPath = path.join(coverDir, "upload.jpg");

    try {
      await writeFile(srcPath, Buffer.from(await entry.arrayBuffer()));
      const cropped = await cropImageToSquare({
        sourcePath: srcPath,
        outputPath,
      });
      if (!cropped.ok) return cropped;

      return ok({
        path: outputPath,
        url: `/api/workspace/${sessionId}/pack-cover/upload.jpg?v=${Date.now()}`,
      });
    } finally {
      await unlink(srcPath).catch(() => undefined);
    }
  }, "upload-pack-cover");
}
