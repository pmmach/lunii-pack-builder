import type { PackDraft } from "@/lib/pack/types";
import type { Result } from "@/lib/shared/result";
import { err, ok } from "@/lib/shared/result";

/** Validation légère côté client (sans accès filesystem). */
export function validatePackDraftClient(pack: PackDraft): Result<true> {
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
  }
  return ok(true);
}
