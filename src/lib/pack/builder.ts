import { existsSync } from "node:fs";
import { v4 as uuidv4 } from "uuid";
import { err, ok, type Result } from "@/lib/shared/result";
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

export function validatePackDraft(pack: PackDraft): Result<true> {
  if (!pack.title.trim()) {
    return err("Le titre du pack est obligatoire", "INVALID_PACK");
  }
  if (pack.stories.length < 1) {
    return err("Le pack doit contenir au moins une histoire", "INVALID_PACK");
  }
  for (const story of pack.stories) {
    if (!story.title.trim()) {
      return err("Chaque histoire doit avoir un titre", "INVALID_PACK");
    }
    if (!existsSync(story.storyAudioPath)) {
      return err(
        `Fichier audio manquant pour « ${story.title} »`,
        "INVALID_PACK"
      );
    }
    if (!existsSync(story.coverImagePath)) {
      return err(
        `Image de couverture manquante pour « ${story.title} »`,
        "INVALID_PACK"
      );
    }
    if (story.titleAudioPath && !existsSync(story.titleAudioPath)) {
      return err(
        `Fichier d'intro manquant pour « ${story.title} »`,
        "INVALID_PACK"
      );
    }
  }
  if (pack.coverImagePath && !existsSync(pack.coverImagePath)) {
    return err("Image de couverture du pack manquante", "INVALID_PACK");
  }
  return ok(true);
}
