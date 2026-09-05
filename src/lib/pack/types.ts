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
  description?: string;
  coverImagePath: string;
  titleAudioPath?: string;
  stories: StoryDraft[];
}
