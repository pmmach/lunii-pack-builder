import type { EpisodeMeta, SourceResolution } from "@/lib/sources/types";

export type WorkshopStep = 2 | 3 | 4;

export interface PreparedStory {
  episode: EpisodeMeta;
  title: string;
  storyAudioPath: string;
  coverImagePath: string;
  titleAudioPath?: string;
  peaks: number[];
  trimStart: number;
  trimEnd: number;
  durationSeconds?: number;
}

export interface SessionState {
  sessionId: string;
  source: SourceResolution;
  selectedEpisodeIds: string[];
  stories: PreparedStory[];
  packTitle: string;
  packAuthor: string;
  packDescription: string;
  step: WorkshopStep;
  downloadUrl?: string;
  downloadSizeBytes?: number;
}

const KEY_PREFIX = "lunii-session:";

export function saveSession(state: SessionState): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY_PREFIX + state.sessionId, JSON.stringify(state));
}

export function loadSession(sessionId: string): SessionState | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(KEY_PREFIX + sessionId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionState;
  } catch {
    return null;
  }
}

export function formatDuration(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return "durée inconnue";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${m.toString().padStart(2, "0")} min`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
