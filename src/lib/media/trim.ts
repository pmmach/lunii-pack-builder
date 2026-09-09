import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import ffmpeg from "fluent-ffmpeg";
import path from "node:path";
import { copyFile, unlink } from "node:fs/promises";
import { debugMedia } from "@/lib/shared/debug-media";
import { err, ok, type Result } from "@/lib/shared/result";
import type { AudioProcessResult, TrimOptions } from "./types";

const FULL_FILE_START_EPS = 0.05;
const FULL_FILE_END_EPS = 0.2;

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

function parseTimemark(timemark: string): number {
  const parts = timemark.split(":").map(Number);
  if (parts.length === 3) {
    const [h = 0, m = 0, s = 0] = parts;
    return h * 3600 + m * 60 + s;
  }
  return 0;
}

export async function trimAudio(
  inputPath: string,
  outputPath: string,
  opts: TrimOptions,
  onProgress?: (percent: number) => void
): Promise<Result<AudioProcessResult>> {
  if (!(opts.endSeconds > opts.startSeconds)) {
    return err("Plage de découpe invalide", "INVALID_TRIM_RANGE");
  }

  const duration = opts.endSeconds - opts.startSeconds;
  const sourceIsMp3 = path.extname(inputPath).toLowerCase() === ".mp3";
  const t0 = Date.now();

  if (sourceIsMp3 && opts.startSeconds <= FULL_FILE_START_EPS) {
    const probed = await probeDuration(inputPath);
    if (probed.ok && opts.endSeconds >= probed.data - FULL_FILE_END_EPS) {
      try {
        onProgress?.(5);
        if (path.resolve(inputPath) !== path.resolve(outputPath)) {
          await copyFile(inputPath, outputPath);
        }
        onProgress?.(100);
        debugMedia("trim:copy", {
          mode: "full-mp3-copy",
          durationSec: Math.round(probed.data * 10) / 10,
          ms: Date.now() - t0,
        });
        return ok({
          filePath: outputPath,
          durationSeconds: probed.data,
        });
      } catch {
        return err("Le traitement audio a échoué", "FFMPEG_ERROR");
      }
    }
  }

  const mode = sourceIsMp3 ? "mp3-stream-copy" : "reencode-mp3";
  debugMedia("trim:ffmpeg-start", {
    mode,
    startSec: Math.round(opts.startSeconds * 10) / 10,
    endSec: Math.round(opts.endSeconds * 10) / 10,
    durationSec: Math.round(duration * 10) / 10,
    ext: path.extname(inputPath).toLowerCase() || "(none)",
  });

  try {
    await new Promise<void>((resolve, reject) => {
      // -ss avant -i (seekInput) : saute rapidement le début sans tout décoder.
      const command = ffmpeg(inputPath).seekInput(opts.startSeconds).setDuration(
        duration
      );

      if (sourceIsMp3) {
        // Source déjà MP3 : copie de flux (quasi instantanée, coupe à la trame ~26ms).
        command.audioCodec("copy");
      } else {
        // Conversion nécessaire (ex. m4a) : lame en mode rapide.
        command
          .audioCodec("libmp3lame")
          .audioFrequency(44100)
          .audioBitrate("128k")
          .outputOptions(["-compression_level", "0"]);
      }

      command
        .noVideo()
        .output(outputPath)
        .on("start", () => onProgress?.(1))
        .on("progress", (progress) => {
          if (!onProgress) return;
          if (typeof progress.percent === "number" && progress.percent > 0) {
            onProgress(Math.min(100, Math.round(progress.percent)));
            return;
          }
          if (progress.timemark) {
            const current = parseTimemark(progress.timemark);
            onProgress(
              Math.min(100, Math.round((current / duration) * 100))
            );
          }
        })
        .on("end", () => {
          onProgress?.(100);
          resolve();
        })
        .on("error", (e) => reject(e))
        .run();
    });

    debugMedia("trim:ffmpeg-ok", {
      mode,
      durationSec: Math.round(duration * 10) / 10,
      ms: Date.now() - t0,
    });
    return ok({
      filePath: outputPath,
      durationSeconds: duration,
    });
  } catch {
    debugMedia("trim:ffmpeg-error", {
      mode,
      ms: Date.now() - t0,
    });
    await unlink(outputPath).catch(() => undefined);
    return err("Le traitement audio a échoué", "FFMPEG_ERROR");
  }
}

/** Durée réelle d'un fichier audio via ffprobe. */
export async function probeDuration(
  inputPath: string
): Promise<Result<number>> {
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (errProbe, data) => {
        if (errProbe) {
          reject(errProbe);
          return;
        }
        const d = data.format.duration;
        if (typeof d !== "number" || !Number.isFinite(d)) {
          reject(new Error("no duration"));
          return;
        }
        resolve(d);
      });
    });
    return ok(duration);
  } catch {
    return err("Impossible de lire la durée audio", "FFPROBE_ERROR");
  }
}

/**
 * Garantit un fichier MP3 prêt pour une découpe rapide (stream copy).
 * - Source déjà MP3 → copie (ou no-op si chemins identiques)
 * - Autre format (m4a…) → ré-encodage libmp3lame une seule fois
 */
export async function ensureMp3(
  inputPath: string,
  outputPath: string,
  onProgress?: (percent: number) => void
): Promise<Result<AudioProcessResult>> {
  const probed = await probeDuration(inputPath);
  if (!probed.ok) return probed;

  const samePath =
    path.resolve(inputPath) === path.resolve(outputPath);
  if (
    samePath &&
    path.extname(inputPath).toLowerCase() === ".mp3"
  ) {
    onProgress?.(100);
    debugMedia("ensureMp3:skip", {
      mode: "already-mp3",
      durationSec: Math.round(probed.data * 10) / 10,
    });
    return ok({
      filePath: outputPath,
      durationSeconds: probed.data,
    });
  }

  debugMedia("ensureMp3:start", {
    ext: path.extname(inputPath).toLowerCase() || "(none)",
    durationSec: Math.round(probed.data * 10) / 10,
  });
  return trimAudio(
    inputPath,
    outputPath,
    { startSeconds: 0, endSeconds: probed.data },
    onProgress
  );
}

