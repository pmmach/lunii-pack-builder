import type { Result } from "@/lib/shared/result";

export interface TtsSynthesizeInput {
  sessionId: string;
  text: string;
}

export interface TtsSynthesizeResult {
  filePath: string;
  cacheHit: boolean;
}

export interface TtsProvider {
  readonly id: "edge" | "azure" | "google";
  synthesize(
    text: string,
    outputPath: string
  ): Promise<Result<{ filePath: string }>>;
}
