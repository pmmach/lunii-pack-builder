import { type Result } from "@/lib/shared/result";
import { resolveFromHtmlBody } from "./generic-page";
import { resolveFromDirectory, isDirectoryUrl } from "./directory-resolver";
import { parseRssFromXml } from "./rss";
import type { SourceResolution } from "./types";
import { assertSafeUrl, readResponseText, safeFetch } from "./url-guard";

function looksLikeXml(contentType: string, bodyStart: string): boolean {
  const ct = contentType.toLowerCase();
  if (
    ct.includes("xml") ||
    ct.includes("rss") ||
    ct.includes("atom")
  ) {
    return true;
  }
  const trimmed = bodyStart.trimStart();
  return (
    trimmed.startsWith("<?xml") ||
    trimmed.startsWith("<rss") ||
    trimmed.startsWith("<feed")
  );
}

/**
 * Pipeline de résolution : URL utilisateur → SourceResolution.
 */
export async function resolvePodcastSource(
  rawUrl: string
): Promise<Result<SourceResolution>> {
  const validated = await assertSafeUrl(rawUrl);
  if (!validated.ok) return validated;

  // Spotify / Apple / Deezer d'abord (pas de scrape audio)
  if (isDirectoryUrl(rawUrl)) {
    return resolveFromDirectory(rawUrl);
  }

  const fetched = await safeFetch(rawUrl);
  if (!fetched.ok) return fetched;

  const contentType = fetched.data.headers.get("content-type") ?? "";
  const text = await readResponseText(fetched.data);
  if (!text.ok) return text;

  // Flux RSS / Atom direct
  if (looksLikeXml(contentType, text.data)) {
    return parseRssFromXml(text.data, rawUrl, "direct");
  }

  // Page HTML : découverte RSS / JSON-LD (réutilise le corps déjà lu)
  return resolveFromHtmlBody(text.data, rawUrl);
}
