export interface EpisodeMeta {
  id: string;
  title: string;
  description?: string;
  audioUrl: string;
  imageUrl?: string;
  durationSeconds?: number;
  publishedAt?: string;
}

export interface SourceResolution {
  kind: "episode" | "show";
  showTitle: string;
  showImageUrl?: string;
  feedUrl: string;
  resolvedFrom?: "direct" | "page-discovery" | "directory-search";
  episodes: EpisodeMeta[];
}
