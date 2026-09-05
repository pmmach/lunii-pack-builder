import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import { err, ok, type Result } from "@/lib/shared/result";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export async function generateWaveformPeaks(
  inputPath: string,
  numPoints = 200
): Promise<Result<number[]>> {
  if (numPoints <= 0) {
    return err("Nombre de points invalide", "INVALID_WAVEFORM");
  }

  try {
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const command = ffmpeg(inputPath)
        .format("f32le")
        .audioChannels(1)
        .audioFrequency(3000)
        .noVideo()
        .on("error", (e) => reject(e));

      const stream = command.pipe();
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", (e: Error) => reject(e));
    });

    const sampleCount = Math.floor(buffer.length / 4);
    if (sampleCount === 0) {
      return ok(Array.from({ length: numPoints }, () => 0));
    }

    const samples = new Float32Array(
      buffer.buffer,
      buffer.byteOffset,
      sampleCount
    );

    const peaks: number[] = [];
    const bucketSize = sampleCount / numPoints;

    for (let i = 0; i < numPoints; i++) {
      const start = Math.floor(i * bucketSize);
      const end = Math.floor((i + 1) * bucketSize);
      let max = 0;
      for (let j = start; j < end && j < sampleCount; j++) {
        const abs = Math.abs(samples[j] ?? 0);
        if (abs > max) max = abs;
      }
      peaks.push(max);
    }

    const globalMax = Math.max(...peaks, 0);
    if (globalMax === 0) {
      return ok(peaks.map(() => 0));
    }

    return ok(peaks.map((p) => p / globalMax));
  } catch {
    return err("Impossible de générer la forme d'onde", "WAVEFORM_ERROR");
  }
}
