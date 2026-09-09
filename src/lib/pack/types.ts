export interface StoryDraft {
  id: string;
  order: number;
  title: string;
  storyAudioPath: string;
  titleAudioPath?: string;
  coverImagePath: string;
}

export type IntroMode = "clip" | "tts";

export interface PackDraft {
  sessionId: string;
  uuid: string;
  title: string;
  author: string;
  description?: string;
  coverImagePath: string;
  titleAudioPath?: string;
  /** Durée (s) de l'intro par défaut pour toutes les histoires sans titleAudioPath. 0 = pas d'intro. Défaut : 8. Ignoré si introMode === "tts". */
  defaultTitleClipSeconds?: number;
  /** Mode d'intro pack-wide. Défaut "tts". */
  introMode?: IntroMode;
  stories: StoryDraft[];
}
