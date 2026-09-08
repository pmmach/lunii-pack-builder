import { z } from "zod";
import { DEFAULT_MAX_COVER_UPLOAD_MB } from "@/lib/pack/constants";

const envSchema = z.object({
  MAX_DOWNLOAD_MB: z.coerce.number().positive().default(100),
  MAX_COVER_UPLOAD_MB: z.coerce
    .number()
    .positive()
    .default(DEFAULT_MAX_COVER_UPLOAD_MB),
  MAX_EPISODE_DURATION_SECONDS: z.coerce.number().positive().default(3600),
  MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().default(2),
  /** Timeout global d'un téléchargement audio (ms). Les images utilisent un plafond plus bas. */
  DOWNLOAD_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  WORKSPACE_TTL_MINUTES: z.coerce.number().positive().default(30),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().positive().default(10),
  PODCASTINDEX_API_KEY: z.string().optional(),
  PODCASTINDEX_API_SECRET: z.string().optional(),
  TTS_PROVIDER: z.enum(["edge", "azure", "google"]).default("edge"),
  TTS_LANGUAGE: z.string().default("fr-FR"),
  TTS_VOICE: z.string().default("fr-FR-EloiseNeural"),
  TTS_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),
  TTS_MAX_CONCURRENT: z.coerce.number().int().positive().default(1),
  TTS_MAX_CHARS: z.coerce.number().int().positive().default(200),
  AZURE_SPEECH_KEY: z.string().optional(),
  AZURE_SPEECH_REGION: z.string().optional(),
  GOOGLE_TTS_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
