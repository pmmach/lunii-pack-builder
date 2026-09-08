import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/shared/env";
import { err, ok, type Result } from "@/lib/shared/result";
import { ttsCacheKey, ttsCachePath } from "./cache";
import { createAzureTtsProvider } from "./providers/azure";
import { createEdgeTtsProvider } from "./providers/edge";
import { createGoogleTtsProvider } from "./providers/google";
import { sanitizeTitleForTts } from "./sanitize";
import { withTtsConcurrencyLimit } from "./semaphore";
import type {
  TtsProvider,
  TtsSynthesizeInput,
  TtsSynthesizeResult,
} from "./types";

/** Injectable pour les tests (write-to-disk). */
let providerOverride: TtsProvider | null = null;

export function setTtsProviderForTests(provider: TtsProvider | null): void {
  providerOverride = provider;
}

export function isTtsConfigured(): boolean {
  if (env.TTS_PROVIDER === "edge") return true;
  if (env.TTS_PROVIDER === "azure") {
    return Boolean(
      env.AZURE_SPEECH_KEY?.trim() && env.AZURE_SPEECH_REGION?.trim()
    );
  }
  return Boolean(env.GOOGLE_TTS_API_KEY?.trim());
}

export function getTtsProvider(): Result<TtsProvider> {
  if (providerOverride) return ok(providerOverride);

  if (!isTtsConfigured()) {
    return err(
      "La voix synthétique n'est pas configurée sur ce serveur.",
      "TTS_NOT_CONFIGURED"
    );
  }

  if (env.TTS_PROVIDER === "google") {
    return ok(createGoogleTtsProvider());
  }
  if (env.TTS_PROVIDER === "azure") {
    return ok(createAzureTtsProvider());
  }
  return ok(createEdgeTtsProvider());
}

export async function synthesizeTitle(
  input: TtsSynthesizeInput
): Promise<Result<TtsSynthesizeResult>> {
  const text = sanitizeTitleForTts(input.text);
  if (!text) {
    return err(
      "Titre vide, impossible de générer la voix.",
      "TTS_EMPTY_TITLE"
    );
  }

  const providerResult = getTtsProvider();
  if (!providerResult.ok) return providerResult;
  const provider = providerResult.data;

  const hash = ttsCacheKey({
    provider: provider.id,
    voice: env.TTS_VOICE,
    language: env.TTS_LANGUAGE,
    text,
  });
  const filePath = ttsCachePath(input.sessionId, hash);

  try {
    await access(filePath);
    return ok({ filePath, cacheHit: true });
  } catch {
    // miss
  }

  return withTtsConcurrencyLimit(async () => {
    try {
      await access(filePath);
      return ok({ filePath, cacheHit: true });
    } catch {
      // still a miss
    }

    await mkdir(path.dirname(filePath), { recursive: true });
    const synthesized = await provider.synthesize(text, filePath);
    if (!synthesized.ok) return synthesized;
    return ok({ filePath: synthesized.data.filePath, cacheHit: false });
  });
}
