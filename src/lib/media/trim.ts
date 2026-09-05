import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import ffmpeg from "fluent-ffmpeg";
import { unlink } from "node:fs/promises";
import { err, ok, type Result } from "@/lib/shared/result";
import type { AudioProcessResult, TrimOptions } from "./types";

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

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(opts.startSeconds)
        .setDuration(duration)
        .audioCodec("libmp3lame")
        .audioFrequency(44100)
        .audioBitrate("128k")
        .noVideo()
        .output(outputPath)
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
        .on("end", () => resolve())
        .on("error", (e) => reject(e))
        .run();
    });

    return ok({
      filePath: outputPath,
      durationSeconds: duration,
    });
  } catch {
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
