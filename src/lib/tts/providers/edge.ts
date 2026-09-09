import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { EdgeTTS } from "edge-tts-universal";
import { env } from "@/lib/shared/env";
import { err, ok, type Result } from "@/lib/shared/result";
import type { TtsProvider } from "../types";

export type EdgeSynthesizeFn = (
  text: string,
  voice: string
) => Promise<Uint8Array>;

async function defaultEdgeSynthesize(
  text: string,
  voice: string
): Promise<Uint8Array> {
  const tts = new EdgeTTS(text, voice);
  const result = await tts.synthesize();
  const audio = result.audio;
  if (audio instanceof Uint8Array) return audio;
  if (typeof Blob !== "undefined" && audio instanceof Blob) {
    return new Uint8Array(await audio.arrayBuffer());
  }
  if (audio instanceof ArrayBuffer) {
    return new Uint8Array(audio);
  }
  return new Uint8Array(audio as unknown as ArrayBuffer);
}

export function createEdgeTtsProvider(deps?: {
  synthesizeFn?: EdgeSynthesizeFn;
  voice?: string;
  timeoutMs?: number;
}): TtsProvider {
  const synthesizeFn = deps?.synthesizeFn ?? defaultEdgeSynthesize;
  const voice = deps?.voice ?? env.TTS_VOICE;
  const timeoutMs = deps?.timeoutMs ?? env.TTS_TIMEOUT_MS;

  return {
    id: "edge",
    async synthesize(
      text: string,
      outputPath: string
    ): Promise<Result<{ filePath: string }>> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const bytes = await Promise.race([
          synthesizeFn(text, voice),
          new Promise<never>((_, reject) => {
            controller.signal.addEventListener("abort", () => {
              reject(Object.assign(new Error("TTS_TIMEOUT"), { name: "AbortError" }));
            });
          }),
        ]);

        if (!bytes.length) {
          return err(
            "La synthèse vocale a renvoyé un fichier vide.",
            "TTS_EMPTY"
          );
        }

        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, bytes);
        return ok({ filePath: outputPath });
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          return err(
            "La synthèse vocale a pris trop de temps.",
            "TTS_TIMEOUT"
          );
        }
        return err(
          "Impossible de contacter le service de synthèse vocale.",
          "TTS_NETWORK"
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
