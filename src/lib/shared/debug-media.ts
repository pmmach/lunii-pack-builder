/**
 * Logs de diagnostic pour le pipeline média (téléchargement, sémaphore, ffmpeg).
 * Actifs en développement, ou si DEBUG_MEDIA=1.
 * Ne jamais y mettre d'URL complète (tokens potentiels dans les query params).
 */
export function isMediaDebugEnabled(): boolean {
  return (
    process.env.DEBUG_MEDIA === "1" ||
    process.env.NODE_ENV === "development"
  );
}

export function debugMedia(
  event: string,
  details: Record<string, string | number | boolean | undefined | null> = {}
): void {
  if (!isMediaDebugEnabled()) return;
  const parts = Object.entries(details)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  console.info(`[media] ${event}${parts ? ` ${parts}` : ""}`);
}

/** Hostname seulement (anti-fuite de tokens en query). */
export function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "(invalid-url)";
  }
}
