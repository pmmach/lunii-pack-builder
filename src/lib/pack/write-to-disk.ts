import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { probeDuration, trimAudio } from "@/lib/media/trim";
import { err, ok, type Result } from "@/lib/shared/result";
import { slugify } from "@/lib/shared/slugify";
import { synthesizeTitle } from "@/lib/tts";
import { validatePackDraft } from "./builder";
import {
  clampTitleClipSeconds,
  DEFAULT_TITLE_CLIP_SECONDS,
} from "./constants";
import { buildStudioPack } from "./studio-format";
import type { IntroMode, PackDraft, StoryDraft } from "./types";

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

/**
 * Si l'histoire n'a pas d'extrait d'intro dédié, en génère un selon introMode :
 * - clip : N premières secondes de story.mp3 (si clipSeconds > 0)
 * - tts : synthèse vocale du titre
 */
async function resolveTitleAudioPath(
  story: StoryDraft,
  tempDir: string,
  clipSeconds: number,
  introMode: IntroMode,
  sessionId: string
): Promise<Result<string | undefined>> {
  if (story.titleAudioPath) return ok(story.titleAudioPath);

  if (introMode === "tts") {
    const synthesized = await synthesizeTitle({
      sessionId,
      text: story.title,
    });
    if (!synthesized.ok) return synthesized;
    return ok(synthesized.data.filePath);
  }

  if (clipSeconds <= 0) return ok(undefined);

  const durationResult = await probeDuration(story.storyAudioPath);
  const realDuration = durationResult.ok
    ? durationResult.data
    : clipSeconds;
  const endSeconds = Math.min(clipSeconds, Math.max(0.1, realDuration));

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
  const introMode: IntroMode = pack.introMode ?? "tts";
  const clipSeconds = clampTitleClipSeconds(
    pack.defaultTitleClipSeconds ?? DEFAULT_TITLE_CLIP_SECONDS
  );

  try {
    await mkdir(path.join(packDir, "assets"), { recursive: true });
    await mkdir(tempDir, { recursive: true });

    const sorted = [...pack.stories].sort((a, b) => a.order - b.order);
    const resolvedStories: StoryDraft[] = [];
    for (const story of sorted) {
      const titleAudioResult = await resolveTitleAudioPath(
        story,
        tempDir,
        clipSeconds,
        introMode,
        pack.sessionId
      );
      if (!titleAudioResult.ok) throw new Error(titleAudioResult.error);
      resolvedStories.push({
        ...story,
        titleAudioPath: titleAudioResult.data,
      });
    }

    let packTitleAudioPath = pack.titleAudioPath;
    if (introMode === "tts" && resolvedStories.length > 1 && !packTitleAudioPath) {
      const packIntro = await synthesizeTitle({
        sessionId: pack.sessionId,
        text: pack.title,
      });
      if (!packIntro.ok) throw new Error(packIntro.error);
      packTitleAudioPath = packIntro.data.filePath;
    }

    const resolvedPack: PackDraft = {
      ...pack,
      introMode,
      titleAudioPath: packTitleAudioPath,
      stories: resolvedStories,
    };
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
