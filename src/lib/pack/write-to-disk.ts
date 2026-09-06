import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { probeDuration, trimAudio } from "@/lib/media/trim";
import { err, ok, type Result } from "@/lib/shared/result";
import { slugify } from "@/lib/shared/slugify";
import { validatePackDraft } from "./builder";
import { DEFAULT_TITLE_CLIP_SECONDS } from "./constants";
import { buildStudioPack } from "./studio-format";
import type { PackDraft, StoryDraft } from "./types";

async function uniqueDirName(
  parent: string,
  baseSlug: string
): Promise<string> {
  const { access } = await import("node:fs/promises");
  let candidate = baseSlug;
  let n = 2;
  while (true) {
    try {
      await access(path.join(parent, candidate));
      candidate = `${baseSlug}-${n}`;
      n += 1;
    } catch {
      return candidate;
    }
  }
}

/** Si l'histoire n'a pas d'extrait d'intro dédié, en génère un par défaut (8 premières secondes de story.mp3) dans tempDir. */
async function resolveTitleAudioPath(
  story: StoryDraft,
  tempDir: string
): Promise<Result<string>> {
  if (story.titleAudioPath) return ok(story.titleAudioPath);

  const durationResult = await probeDuration(story.storyAudioPath);
  const realDuration = durationResult.ok
    ? durationResult.data
    : DEFAULT_TITLE_CLIP_SECONDS;
  const endSeconds = Math.min(
    DEFAULT_TITLE_CLIP_SECONDS,
    Math.max(0.1, realDuration)
  );

  const generatedPath = path.join(tempDir, `${story.id}-title.mp3`);
  const clipped = await trimAudio(story.storyAudioPath, generatedPath, {
    startSeconds: 0,
    endSeconds,
  });
  if (!clipped.ok) return clipped;
  return ok(generatedPath);
}

export async function writePackToDisk(
  pack: PackDraft,
  destDir: string
): Promise<Result<{ packDir: string }>> {
  const validated = validatePackDraft(pack);
  if (!validated.ok) return validated;

  await mkdir(destDir, { recursive: true });
  const packSlug = await uniqueDirName(destDir, slugify(pack.title));
  const packDir = path.join(destDir, packSlug);
  const tempDir = path.join(destDir, `.tmp-${packSlug}`);

  try {
    await mkdir(path.join(packDir, "assets"), { recursive: true });
    await mkdir(tempDir, { recursive: true });

    const sorted = [...pack.stories].sort((a, b) => a.order - b.order);
    const resolvedStories: StoryDraft[] = [];
    for (const story of sorted) {
      const titleAudioResult = await resolveTitleAudioPath(story, tempDir);
      if (!titleAudioResult.ok) throw new Error(titleAudioResult.error);
      resolvedStories.push({
        ...story,
        titleAudioPath: titleAudioResult.data,
      });
    }

    const resolvedPack: PackDraft = { ...pack, stories: resolvedStories };
    const { studioPack, assets } = buildStudioPack(resolvedPack);

    for (const asset of assets) {
      await copyFile(
        asset.sourcePath,
        path.join(packDir, "assets", asset.assetFileName)
      );
    }

    await writeFile(
      path.join(packDir, "story.json"),
      JSON.stringify(studioPack),
      "utf-8"
    );

    return ok({ packDir });
  } catch (e) {
    await rm(packDir, { recursive: true, force: true }).catch(() => undefined);
    return err(
      e instanceof Error
        ? e.message
        : "Échec de l'écriture du pack sur le disque",
      "WRITE_PACK_FAILED"
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
