import { v4 as uuidv4 } from "uuid";
import type { PackDraft, StoryDraft } from "./types";

export function createPackDraft(
  sessionId: string,
  meta: { title: string; description?: string }
): PackDraft {
  return {
    sessionId,
    uuid: uuidv4(),
    title: meta.title,
    description: meta.description,
    coverImagePath: "",
    stories: [],
  };
}

export function addStoryToPack(
  pack: PackDraft,
  story: Omit<StoryDraft, "order">
): PackDraft {
  const stories = [
    ...pack.stories,
    { ...story, order: pack.stories.length },
  ];
  const coverImagePath =
    pack.coverImagePath || story.coverImagePath || pack.coverImagePath;
  return { ...pack, stories, coverImagePath };
}

export function removeStoryFromPack(
  pack: PackDraft,
  storyId: string
): PackDraft {
  const stories = pack.stories
    .filter((s) => s.id !== storyId)
    .map((s, index) => ({ ...s, order: index }));
  return { ...pack, stories };
}

export function reorderStories(
  pack: PackDraft,
  orderedIds: string[]
): PackDraft {
  const byId = new Map(pack.stories.map((s) => [s.id, s]));
  const stories: StoryDraft[] = [];
  for (const id of orderedIds) {
    const story = byId.get(id);
    if (story) {
      stories.push({ ...story, order: stories.length });
      byId.delete(id);
    }
  }
  for (const story of byId.values()) {
    stories.push({ ...story, order: stories.length });
  }
  return { ...pack, stories };
}
