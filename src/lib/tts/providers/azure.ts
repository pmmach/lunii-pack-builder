import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/shared/env";
import { err, ok, type Result } from "@/lib/shared/result";
import type { TtsProvider } from "../types";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function createAzureTtsProvider(deps?: {
  fetchFn?: typeof fetch;
  key?: string;
  region?: string;
  voice?: string;
  language?: string;
  timeoutMs?: number;
}): TtsProvider {
  const fetchFn = deps?.fetchFn ?? fetch;
  const key = deps?.key ?? env.AZURE_SPEECH_KEY ?? "";
  const region = deps?.region ?? env.AZURE_SPEECH_REGION ?? "";
  const voice = deps?.voice ?? env.TTS_VOICE;
  const language = deps?.language ?? env.TTS_LANGUAGE;
  const timeoutMs = deps?.timeoutMs ?? env.TTS_TIMEOUT_MS;

  return {
    id: "azure",
    async synthesize(
      text: string,
      outputPath: string
    ): Promise<Result<{ filePath: string }>> {
      if (!key || !region) {
        return err(
          "La voix synthétique n'est pas configurée sur ce serveur.",
          "TTS_NOT_CONFIGURED"
        );
      }

      const ssml = `<speak version="1.0" xml:lang="${escapeXml(language)}"><voice name="${escapeXml(voice)}">${escapeXml(text)}</voice></speak>`;
      const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetchFn(url, {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat":
              "audio-16khz-128kbitrate-mono-mp3",
            "User-Agent": "LuniiPackBuilder",
          },
          body: ssml,
          signal: controller.signal,
        });

        if (res.status === 429) {
          return err(
            "Quota TTS atteint, réessaie plus tard.",
            "TTS_QUOTA"
          );
        }
        if (!res.ok) {
          return err(
            "La synthèse vocale a échoué. Réessaie plus tard.",
            "TTS_PROVIDER_ERROR"
          );
        }

        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length === 0) {
          return err(
            "La synthèse vocale a renvoyé un fichier vide.",
            "TTS_EMPTY"
          );
        }

        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, buffer);
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
