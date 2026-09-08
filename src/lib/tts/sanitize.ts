import { env } from "@/lib/shared/env";

/**
 * Nettoie un titre pour la synthèse vocale : trim, collapse whitespace,
 * strip tags HTML, tronque à maxChars (frontière de mot si possible).
 */
export function sanitizeTitleForTts(
  raw: string,
  maxChars: number = env.TTS_MAX_CHARS
): string {
  const text = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxChars) return text;

  const sliced = text.slice(0, maxChars);
  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.5) {
    return sliced.slice(0, lastSpace).trim();
  }
  return sliced.trim();
}
