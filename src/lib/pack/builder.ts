import { existsSync } from "node:fs";
import { err, ok, type Result } from "@/lib/shared/result";
import type { PackDraft } from "./types";

export {
  createPackDraft,
  addStoryToPack,
  removeStoryFromPack,
  reorderStories,
} from "./model";

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
