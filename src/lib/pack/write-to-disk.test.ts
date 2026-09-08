import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setTtsProviderForTests } from "@/lib/tts";
import { addStoryToPack, createPackDraft } from "./builder";
import type { StudioPack } from "./studio-format";
import { writePackToDisk } from "./write-to-disk";
import type { TtsProvider } from "@/lib/tts/types";
import { ok } from "@/lib/shared/result";

const audio = path.join(
  __dirname,
  "..",
  "media",
  "__fixtures__",
  "sample.mp3"
);
const cover = path.join(
  __dirname,
  "..",
  "media",
  "__fixtures__",
  "sample.jpg"
);

let tmpDir: string;

afterEach(async () => {
  setTtsProviderForTests(null);
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  await rm(path.join(process.cwd(), "workspace", "sess-tts"), {
    recursive: true,
    force: true,
  }).catch(() => undefined);
  await rm(path.join(process.cwd(), "workspace", "sess-multi-tts"), {
    recursive: true,
    force: true,
  }).catch(() => undefined);
});

describe("writePackToDisk", () => {
  it("écrit le format STUdio final (story.json + assets/) pour un pack à 1 histoire", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-pack-"));
    let pack = createPackDraft("sess", {
      title: "Pack Test",
      author: "Auteur Test",
      description: "Desc",
    });
    pack = addStoryToPack(pack, {
      id: "1",
      title: "Première histoire",
      storyAudioPath: audio,
      coverImagePath: cover,
    });

    const result = await writePackToDisk(pack, tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const packDir = result.data.packDir;
    expect(path.basename(packDir)).toBe("pack-test");

    const rootFiles = await readdir(packDir);
    expect(rootFiles.sort()).toEqual(["assets", "story.json"]);

    const assetFiles = await readdir(path.join(packDir, "assets"));
    // cover + intro (générée par défaut) + story = 3 fichiers
    expect(assetFiles).toHaveLength(3);

    const studioPack = JSON.parse(
      await readFile(path.join(packDir, "story.json"), "utf-8")
    ) as StudioPack;

    expect(studioPack.format).toBe("v1");
    expect(studioPack.version).toBe(2);
    expect(studioPack.uuid).toBe(pack.uuid);
    expect(studioPack.title).toBe("Pack Test");
    expect(studioPack.author).toBe("Auteur Test");
    expect(studioPack.description).toBe("Desc");

    expect(studioPack.stageNodes).toHaveLength(2);
    const cover_ = studioPack.stageNodes.find((n) => n.type === "cover");
    const story = studioPack.stageNodes.find((n) => n.type === "story");
    expect(cover_?.uuid).toBe(pack.uuid);
    expect(cover_?.squareOne).toBe(true);
    expect(cover_?.image).toBeTruthy();
    expect(cover_?.audio).toBeTruthy();
    expect(cover_?.homeTransition).toBeNull();
    expect(story?.image).toBeNull();
    expect(story?.audio).toBeTruthy();
    expect(story?.okTransition).not.toBeNull();
    expect(story?.homeTransition).toEqual(story?.okTransition);

    expect(studioPack.actionNodes).toHaveLength(2);
    const toStory = studioPack.actionNodes.find(
      (a) => a.id === cover_?.okTransition?.actionNode
    );
    const backToCover = studioPack.actionNodes.find(
      (a) => a.id === story?.okTransition?.actionNode
    );
    expect(toStory?.options).toEqual([story?.uuid]);
    expect(backToCover?.options).toEqual([pack.uuid]);

    // tous les fichiers référencés dans story.json existent bien dans assets/
    for (const node of studioPack.stageNodes) {
      if (node.image) expect(assetFiles).toContain(node.image);
      if (node.audio) expect(assetFiles).toContain(node.audio);
    }
  }, 30_000);

  it("écrit un graphe menu/story par histoire pour un pack multi-histoires", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-pack-"));
    let pack = createPackDraft("sess", {
      title: "Pack Multi",
      author: "Auteur Test",
      description: "Desc",
    });
    pack = addStoryToPack(pack, {
      id: "1",
      title: "Histoire 1",
      storyAudioPath: audio,
      coverImagePath: cover,
    });
    pack = addStoryToPack(pack, {
      id: "2",
      title: "Histoire 2",
      storyAudioPath: audio,
      coverImagePath: cover,
    });

    const result = await writePackToDisk(pack, tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const studioPack = JSON.parse(
      await readFile(path.join(result.data.packDir, "story.json"), "utf-8")
    ) as StudioPack;

    // cover racine + (menu + story) par histoire = 1 + 2*2 = 5
    expect(studioPack.stageNodes).toHaveLength(5);
    // action racine + une action par histoire = 1 + 2 = 3
    expect(studioPack.actionNodes).toHaveLength(3);

    const rootCover = studioPack.stageNodes.find((n) => n.type === "cover");
    expect(rootCover?.uuid).toBe(pack.uuid);
    const rootAction = studioPack.actionNodes.find(
      (a) => a.id === rootCover?.okTransition?.actionNode
    );
    expect(rootAction?.options).toHaveLength(2);

    const menus = studioPack.stageNodes.filter((n) => n.type === "menu");
    expect(menus).toHaveLength(2);
    for (const menu of menus) {
      expect(menu.image).toBeTruthy();
      expect(menu.homeTransition).toBeNull();
    }

    const stories = studioPack.stageNodes.filter((n) => n.type === "story");
    expect(stories).toHaveLength(2);
    stories.forEach((story, index) => {
      expect(story.image).toBeNull();
      const back = {
        actionNode: rootAction?.id,
        optionIndex: index,
      };
      expect(story.homeTransition).toEqual(back);
      expect(story.okTransition).toEqual(back);
    });
  }, 30_000);

  it("n'écrit pas d'intro audio quand defaultTitleClipSeconds = 0", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-pack-"));
    let pack = createPackDraft("sess", {
      title: "Pack Sans Intro",
      author: "Auteur Test",
    });
    pack = {
      ...pack,
      defaultTitleClipSeconds: 0,
    };
    pack = addStoryToPack(pack, {
      id: "1",
      title: "Première histoire",
      storyAudioPath: audio,
      coverImagePath: cover,
    });

    const result = await writePackToDisk(pack, tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const assetFiles = await readdir(path.join(result.data.packDir, "assets"));
    // cover + story uniquement (pas d'intro)
    expect(assetFiles).toHaveLength(2);

    const studioPack = JSON.parse(
      await readFile(path.join(result.data.packDir, "story.json"), "utf-8")
    ) as StudioPack;

    const cover_ = studioPack.stageNodes.find((n) => n.type === "cover");
    expect(cover_?.audio).toBeNull();
    expect(cover_?.image).toBeTruthy();
  }, 30_000);

  it("gère les collisions de noms de dossiers", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-pack-"));
    let pack1 = createPackDraft("s1", { title: "Même Titre", author: "A" });
    pack1 = addStoryToPack(pack1, {
      id: "1",
      title: "H",
      storyAudioPath: audio,
      coverImagePath: cover,
    });
    const r1 = await writePackToDisk(pack1, tmpDir);
    expect(r1.ok).toBe(true);

    let pack2 = createPackDraft("s2", { title: "Même Titre", author: "A" });
    pack2 = addStoryToPack(pack2, {
      id: "2",
      title: "H",
      storyAudioPath: audio,
      coverImagePath: cover,
    });
    const r2 = await writePackToDisk(pack2, tmpDir);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(path.basename(r1.data.packDir)).toBe("meme-titre");
    expect(path.basename(r2.data.packDir)).toBe("meme-titre-2");
  }, 30_000);

  it("génère des intros TTS pour une histoire", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-pack-"));
    const fake: TtsProvider = {
      id: "azure",
      async synthesize(text, outputPath) {
        await writeFile(outputPath, Buffer.from(`tts:${text}`));
        return ok({ filePath: outputPath });
      },
    };
    setTtsProviderForTests(fake);

    let pack = createPackDraft("sess-tts", {
      title: "Pack TTS",
      author: "Auteur",
    });
    pack = { ...pack, introMode: "tts" };
    pack = addStoryToPack(pack, {
      id: "1",
      title: "Histoire Magique",
      storyAudioPath: audio,
      coverImagePath: cover,
    });

    const result = await writePackToDisk(pack, tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const assetFiles = await readdir(path.join(result.data.packDir, "assets"));
    // cover + intro TTS + story
    expect(assetFiles).toHaveLength(3);

    const studioPack = JSON.parse(
      await readFile(path.join(result.data.packDir, "story.json"), "utf-8")
    ) as StudioPack;
    const cover_ = studioPack.stageNodes.find((n) => n.type === "cover");
    expect(cover_?.audio).toBeTruthy();
  }, 30_000);

  it("génère aussi l'intro pack en multi-histoires TTS", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-pack-"));
    const texts: string[] = [];
    const fake: TtsProvider = {
      id: "azure",
      async synthesize(text, outputPath) {
        texts.push(text);
        await writeFile(outputPath, Buffer.from(`tts:${text}`));
        return ok({ filePath: outputPath });
      },
    };
    setTtsProviderForTests(fake);

    let pack = createPackDraft("sess-multi-tts", {
      title: "Pack Multi",
      author: "Auteur",
    });
    pack = { ...pack, introMode: "tts" };
    pack = addStoryToPack(pack, {
      id: "1",
      title: "Histoire A",
      storyAudioPath: audio,
      coverImagePath: cover,
    });
    pack = addStoryToPack(pack, {
      id: "2",
      title: "Histoire B",
      storyAudioPath: audio,
      coverImagePath: cover,
    });

    const result = await writePackToDisk(pack, tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(texts).toContain("Histoire A");
    expect(texts).toContain("Histoire B");
    expect(texts).toContain("Pack Multi");

    const studioPack = JSON.parse(
      await readFile(path.join(result.data.packDir, "story.json"), "utf-8")
    ) as StudioPack;
    const cover_ = studioPack.stageNodes.find((n) => n.type === "cover");
    expect(cover_?.audio).toBeTruthy();
    const menus = studioPack.stageNodes.filter((n) => n.type === "menu");
    expect(menus).toHaveLength(2);
    for (const menu of menus) {
      expect(menu.audio).toBeTruthy();
    }
  }, 30_000);
});
