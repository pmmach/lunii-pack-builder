import { z } from "zod";

const envSchema = z.object({
  MAX_DOWNLOAD_MB: z.coerce.number().positive().default(100),
  MAX_EPISODE_DURATION_SECONDS: z.coerce.number().positive().default(3600),
  MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().default(2),
  WORKSPACE_TTL_MINUTES: z.coerce.number().positive().default(30),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().positive().default(10),
  PODCASTINDEX_API_KEY: z.string().optional(),
  PODCASTINDEX_API_SECRET: z.string().optional(),
});

export const env = envSchema.parse(process.env);
