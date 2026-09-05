import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { load as yamlLoad } from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";
import {
  addStoryToPack,
  createPackDraft,
} from "./builder";
import { writePackToDisk } from "./write-to-disk";

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
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe("writePackToDisk", () => {
  it("écrit l'arborescence Lunii Admin Web attendue", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-pack-"));
    let pack = createPackDraft("sess", {
      title: "Pack Test",
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
    expect(rootFiles).toContain("cover.jpeg");
    expect(rootFiles).toContain("md.yaml");
    expect(rootFiles).toContain("premiere-histoire");

    const md = yamlLoad(
      await readFile(path.join(packDir, "md.yaml"), "utf-8")
    ) as { title: string; description: string; uuid: string };
    expect(md.title).toBe("Pack Test");
    expect(md.description).toBe("Desc");
    expect(md.uuid).toBe(pack.uuid);

    const storyFiles = await readdir(path.join(packDir, "premiere-histoire"));
    expect(storyFiles.sort()).toEqual(
      ["cover.jpeg", "story.mp3", "title.mp3"].sort()
    );
  }, 30_000);

  it("gère les collisions de noms de dossiers", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-pack-"));
    let pack1 = createPackDraft("s1", { title: "Même Titre" });
    pack1 = addStoryToPack(pack1, {
      id: "1",
      title: "H",
      storyAudioPath: audio,
      coverImagePath: cover,
    });
    const r1 = await writePackToDisk(pack1, tmpDir);
    expect(r1.ok).toBe(true);

    let pack2 = createPackDraft("s2", { title: "Même Titre" });
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
});
