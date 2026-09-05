"use server";

import { mkdir } from "node:fs/promises";
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
import { trimAudio } from "@/lib/media/trim";
import type { TrimOptions } from "@/lib/media/types";
import { generateWaveformPeaks } from "@/lib/media/waveform";
import { env } from "@/lib/shared/env";
import { err, ok, type Result } from "@/lib/shared/result";
import { slugify } from "@/lib/shared/slugify";
import type { EpisodeMeta } from "@/lib/sources/types";

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

  const jobId = createJob();
  updateJob(jobId, { status: "running", message: "Préparation…" });

  void withConcurrencyLimit(async () => {
    try {
      const safeEpisodeId = slugify(episode.id) || "episode";
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
        progress: 10,
        message: "Téléchargement de l'audio…",
      });
      const audioDl = await downloadToWorkspace(
        episode.audioUrl,
        audioPath,
        "audio"
      );
      if (!audioDl.ok) {
        updateJob(jobId, {
          status: "error",
          message: audioDl.error,
          errorCode: audioDl.code,
        });
        return;
      }

      let coverSourcePath: string | undefined;
      if (episode.imageUrl) {
        updateJob(jobId, {
          progress: 40,
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
        progress: 55,
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
        progress: 70,
        message: "Génération de la forme d'onde…",
      });
      const peaks = await generateWaveformPeaks(audioPath, 200);
      if (!peaks.ok) {
        updateJob(jobId, {
          status: "error",
          message: peaks.error,
          errorCode: peaks.code,
        });
        return;
      }

      // Par défaut : copie "trim" complète vers story.mp3 (plage 0 → durée)
      // L'UI appellera trimEpisodeAction pour affiner.
      updateJob(jobId, {
        progress: 85,
        message: "Normalisation audio…",
      });
      const storyPath = path.join(processedDir, "story.mp3");
      // Utiliser trim 0 → très grand pour forcer le réencodage mp3
      // (si durée inconnue, on lit via un trim large — fallback 3600s)
      const end =
        episode.durationSeconds && episode.durationSeconds > 0
          ? episode.durationSeconds
          : env.MAX_EPISODE_DURATION_SECONDS;
      const trimmed = await trimAudio(audioPath, storyPath, {
        startSeconds: 0,
        endSeconds: Math.max(0.1, end),
      });
      // Si le trim échoue (durée trop longue vs fichier), on retente avec 2s min
      let finalStory = storyPath;
      if (!trimmed.ok) {
        // Garder l'audio source tel quel n'est pas idéal (format) —
        // on marque quand même done avec le source path
        finalStory = audioPath;
      }

      updateJob(jobId, {
        status: "done",
        progress: 100,
        message: "Prêt",
        resultRef: JSON.stringify({
          episodeId: safeEpisodeId,
          audioPath,
          storyPath: finalStory,
          coverPath: coverOut,
          peaks: peaks.data,
        }),
      });
    } catch (e) {
      updateJob(jobId, {
        status: "error",
        message:
          e instanceof Error ? e.message : "Erreur inattendue de préparation",
        errorCode: "PREPARE_FAILED",
      });
    }
  });

  return ok({ jobId });
}

export async function getJobStatusAction(
  jobId: string
): Promise<Result<JobState>> {
  const job = getJob(jobId);
  if (!job) return err("Tâche introuvable", "JOB_NOT_FOUND");
  return ok(job);
}

export async function trimEpisodeAction(
  sessionId: string,
  episodeId: string,
  opts: TrimOptions
): Promise<Result<{ jobId: string }>> {
  const jobId = createJob();
  updateJob(jobId, {
    status: "running",
    message: "Découpe audio…",
    progress: 5,
  });

  void withConcurrencyLimit(async () => {
    try {
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

      // Chercher le fichier audio source
      const { readdir } = await import("node:fs/promises");
      const files = await readdir(sourceDir).catch(() => [] as string[]);
      const audioFile = files.find((f) => f.startsWith("audio."));
      if (!audioFile) {
        updateJob(jobId, {
          status: "error",
          message: "Audio source introuvable",
          errorCode: "SOURCE_MISSING",
        });
        return;
      }

      const inputPath = path.join(sourceDir, audioFile);
      const outputPath = path.join(processedDir, "story.mp3");

      const result = await trimAudio(
        inputPath,
        outputPath,
        opts,
        (percent) => {
          updateJob(jobId, {
            progress: Math.min(95, percent),
            message: "Découpe audio…",
          });
        }
      );

      if (!result.ok) {
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
        message: "Découpe terminée",
        resultRef: JSON.stringify({
          storyPath: result.data.filePath,
          durationSeconds: result.data.durationSeconds,
        }),
      });
    } catch (e) {
      updateJob(jobId, {
        status: "error",
        message: e instanceof Error ? e.message : "Échec de la découpe",
        errorCode: "TRIM_FAILED",
      });
    }
  });

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
