import { existsSync } from "node:fs";
import {
  isPathInsideSessionWorkspace,
  isValidSessionId,
} from "@/lib/shared/session-id";
import { err, ok, type Result } from "@/lib/shared/result";
import type { PackDraft } from "./types";

export {
  createPackDraft,
  addStoryToPack,
  removeStoryFromPack,
  reorderStories,
} from "./model";

function assertSessionPath(
  filePath: string,
  sessionId: string,
  label: string
): Result<true> {
  if (!isPathInsideSessionWorkspace(filePath, sessionId)) {
    return err(`${label} hors de la session`, "INVALID_PACK");
  }
  if (!existsSync(filePath)) {
    return err(`${label} manquant`, "INVALID_PACK");
  }
  return ok(true);
}

export function validatePackDraft(pack: PackDraft): Result<true> {
  if (!isValidSessionId(pack.sessionId)) {
    return err("Session invalide", "INVALID_SESSION");
  }
  if (!pack.title.trim()) {
    return err("Le titre du pack est obligatoire", "INVALID_PACK");
  }
  if (!pack.author.trim()) {
    return err("L'auteur du pack est obligatoire", "INVALID_PACK");
  }
  if (pack.stories.length < 1) {
    return err("Le pack doit contenir au moins une histoire", "INVALID_PACK");
  }
  for (const story of pack.stories) {
    if (!story.title.trim()) {
      return err("Chaque histoire doit avoir un titre", "INVALID_PACK");
    }
    const audio = assertSessionPath(
      story.storyAudioPath,
      pack.sessionId,
      `Fichier audio pour « ${story.title} »`
    );
    if (!audio.ok) return audio;
    const cover = assertSessionPath(
      story.coverImagePath,
      pack.sessionId,
      `Image de couverture pour « ${story.title} »`
    );
    if (!cover.ok) return cover;
    if (story.titleAudioPath) {
      const intro = assertSessionPath(
        story.titleAudioPath,
        pack.sessionId,
        `Fichier d'intro pour « ${story.title} »`
      );
      if (!intro.ok) return intro;
    }
  }
  if (pack.coverImagePath) {
    const packCover = assertSessionPath(
      pack.coverImagePath,
      pack.sessionId,
      "Image de couverture du pack"
    );
    if (!packCover.ok) return packCover;
  }
  if (pack.titleAudioPath) {
    const packIntro = assertSessionPath(
      pack.titleAudioPath,
      pack.sessionId,
      "Intro audio du pack"
    );
    if (!packIntro.ok) return packIntro;
  }
  return ok(true);
}
