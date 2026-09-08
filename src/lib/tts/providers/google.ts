import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/shared/env";
import { err, ok, type Result } from "@/lib/shared/result";
import type { TtsProvider } from "../types";

export function createGoogleTtsProvider(deps?: {
  fetchFn?: typeof fetch;
  apiKey?: string;
  voice?: string;
  language?: string;
  timeoutMs?: number;
}): TtsProvider {
  const fetchFn = deps?.fetchFn ?? fetch;
  const apiKey = deps?.apiKey ?? env.GOOGLE_TTS_API_KEY ?? "";
  const voice = deps?.voice ?? env.TTS_VOICE;
  const language = deps?.language ?? env.TTS_LANGUAGE;
  const timeoutMs = deps?.timeoutMs ?? env.TTS_TIMEOUT_MS;

  return {
    id: "google",
    async synthesize(
      text: string,
      outputPath: string
    ): Promise<Result<{ filePath: string }>> {
      if (!apiKey) {
        return err(
          "La voix synthétique n'est pas configurée sur ce serveur.",
          "TTS_NOT_CONFIGURED"
        );
      }

      const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetchFn(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "LuniiPackBuilder",
          },
          body: JSON.stringify({
            input: { text },
            voice: {
              languageCode: language,
              name: voice,
            },
            audioConfig: {
              audioEncoding: "MP3",
            },
          }),
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

        const json = (await res.json()) as { audioContent?: string };
        if (!json.audioContent) {
          return err(
            "La synthèse vocale a renvoyé un fichier vide.",
            "TTS_EMPTY"
          );
        }

        const buffer = Buffer.from(json.audioContent, "base64");
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
