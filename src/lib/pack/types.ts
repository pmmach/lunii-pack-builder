export interface StoryDraft {
  id: string;
  order: number;
  title: string;
  storyAudioPath: string;
  titleAudioPath?: string;
  coverImagePath: string;
}

export interface PackDraft {
  sessionId: string;
  uuid: string;
  title: string;
  author: string;
  description?: string;
  coverImagePath: string;
  titleAudioPath?: string;
  /** Durée (s) de l'intro par défaut pour toutes les histoires sans titleAudioPath. 0 = pas d'intro. Défaut : 8. */
  defaultTitleClipSeconds?: number;
  stories: StoryDraft[];
}
