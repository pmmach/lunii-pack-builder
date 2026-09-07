export const DEFAULT_TITLE_CLIP_SECONDS = 8;
export const MAX_TITLE_CLIP_SECONDS = 30;
export const DEFAULT_MAX_COVER_UPLOAD_MB = 10;

/** Borne une durée d'intro pack dans [0, MAX_TITLE_CLIP_SECONDS]. */
export function clampTitleClipSeconds(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TITLE_CLIP_SECONDS;
  return Math.min(MAX_TITLE_CLIP_SECONDS, Math.max(0, Math.round(value)));
}
