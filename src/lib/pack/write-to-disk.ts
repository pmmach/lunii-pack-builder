import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { dump as yamlDump } from "js-yaml";
import { probeDuration, trimAudio } from "@/lib/media/trim";
import { err, ok, type Result } from "@/lib/shared/result";
import { slugify } from "@/lib/shared/slugify";
import { validatePackDraft } from "./builder";
import { DEFAULT_TITLE_CLIP_SECONDS } from "./constants";
import type { PackDraft } from "./types";

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

export async function writePackToDisk(
  pack: PackDraft,
  destDir: string
): Promise<Result<{ packDir: string }>> {
  const validated = validatePackDraft(pack);
  if (!validated.ok) return validated;

  await mkdir(destDir, { recursive: true });
  const packSlug = await uniqueDirName(destDir, slugify(pack.title));
  const packDir = path.join(destDir, packSlug);

  try {
    await mkdir(packDir, { recursive: true });

    if (pack.coverImagePath) {
      await copyFile(pack.coverImagePath, path.join(packDir, "cover.jpeg"));
    }

    if (pack.titleAudioPath) {
      await copyFile(pack.titleAudioPath, path.join(packDir, "title.mp3"));
    }

    const md = {
      title: pack.title,
      description: pack.description ?? "",
      uuid: pack.uuid,
    };
    await writeFile(
      path.join(packDir, "md.yaml"),
      yamlDump(md, { lineWidth: -1 }),
      "utf-8"
    );

    const sorted = [...pack.stories].sort((a, b) => a.order - b.order);
    const usedStorySlugs = new Set<string>();

    for (const story of sorted) {
      let storySlug = slugify(story.title);
      if (usedStorySlugs.has(storySlug)) {
        let n = 2;
        while (usedStorySlugs.has(`${storySlug}-${n}`)) n += 1;
        storySlug = `${storySlug}-${n}`;
      }
      usedStorySlugs.add(storySlug);

      const storyDir = path.join(packDir, storySlug);
      await mkdir(storyDir, { recursive: true });
      await copyFile(story.coverImagePath, path.join(storyDir, "cover.jpeg"));
      await copyFile(story.storyAudioPath, path.join(storyDir, "story.mp3"));

      const titleOut = path.join(storyDir, "title.mp3");
      if (story.titleAudioPath) {
        await copyFile(story.titleAudioPath, titleOut);
      } else {
        const durationResult = await probeDuration(story.storyAudioPath);
        const realDuration = durationResult.ok
          ? durationResult.data
          : DEFAULT_TITLE_CLIP_SECONDS;
        const endSeconds = Math.min(
          DEFAULT_TITLE_CLIP_SECONDS,
          Math.max(0.1, realDuration)
        );
        const clipped = await trimAudio(story.storyAudioPath, titleOut, {
          startSeconds: 0,
          endSeconds,
        });
        if (!clipped.ok) {
          throw new Error(clipped.error);
        }
      }
    }

    return ok({ packDir });
  } catch (e) {
    await rm(packDir, { recursive: true, force: true }).catch(() => undefined);
    return err(
      e instanceof Error
        ? e.message
        : "Échec de l'écriture du pack sur le disque",
      "WRITE_PACK_FAILED"
    );
  }
}
