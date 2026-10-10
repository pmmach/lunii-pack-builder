import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addStoryToPack,
  createPackDraft,
  removeStoryFromPack,
  reorderStories,
  validatePackDraft,
} from "./builder";
import { sessionWorkspaceRoot } from "@/lib/shared/session-id";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

const fixtureAudio = path.join(
  __dirname,
  "..",
  "media",
  "__fixtures__",
  "sample.mp3"
);
const fixtureCover = path.join(
  __dirname,
  "..",
  "media",
  "__fixtures__",
  "sample.jpg"
);

let audio = "";
let cover = "";

async function setupSessionFiles(): Promise<void> {
  const root = sessionWorkspaceRoot(SESSION_ID);
  const dir = path.join(root, "processed", "ep");
  await mkdir(dir, { recursive: true });
  audio = path.join(dir, "story.mp3");
  cover = path.join(dir, "cover.jpg");
  await copyFile(fixtureAudio, audio);
  await copyFile(fixtureCover, cover);
}

afterEach(async () => {
  await rm(sessionWorkspaceRoot(SESSION_ID), {
    recursive: true,
    force: true,
  }).catch(() => undefined);
});

describe("pack builder", () => {
  it("ajoute, réordonne et retire des histoires", async () => {
    await setupSessionFiles();
    let pack = createPackDraft(SESSION_ID, {
      title: "Mon pack",
      author: "Auteur",
    });
    pack = addStoryToPack(pack, {
      id: "a",
      title: "Histoire A",
      storyAudioPath: audio,
      coverImagePath: cover,
    });
    pack = addStoryToPack(pack, {
      id: "b",
      title: "Histoire B",
      storyAudioPath: audio,
      coverImagePath: cover,
    });
    expect(pack.stories).toHaveLength(2);
    expect(pack.coverImagePath).toBe(cover);

    pack = reorderStories(pack, ["b", "a"]);
    expect(pack.stories.map((s) => s.id)).toEqual(["b", "a"]);
    expect(pack.stories[0]?.order).toBe(0);
    expect(pack.stories[1]?.order).toBe(1);

    pack = removeStoryFromPack(pack, "b");
    expect(pack.stories).toHaveLength(1);
    expect(pack.stories[0]?.id).toBe("a");
  });

  it("valide les cas d'invalidité", async () => {
    await setupSessionFiles();
    const emptyTitle = createPackDraft(SESSION_ID, {
      title: "  ",
      author: "Auteur",
    });
    expect(validatePackDraft(emptyTitle).ok).toBe(false);

    const emptyAuthor = createPackDraft(SESSION_ID, {
      title: "OK",
      author: "  ",
    });
    expect(validatePackDraft(emptyAuthor).ok).toBe(false);

    let pack = createPackDraft(SESSION_ID, { title: "OK", author: "Auteur" });
    expect(validatePackDraft(pack).ok).toBe(false);

    pack = addStoryToPack(pack, {
      id: "a",
      title: "H",
      storyAudioPath: path.join(
        sessionWorkspaceRoot(SESSION_ID),
        "missing.mp3"
      ),
      coverImagePath: cover,
    });
    expect(validatePackDraft(pack).ok).toBe(false);

    pack = createPackDraft(SESSION_ID, { title: "OK", author: "Auteur" });
    pack = addStoryToPack(pack, {
      id: "a",
      title: "H",
      storyAudioPath: audio,
      coverImagePath: cover,
    });
    expect(validatePackDraft(pack).ok).toBe(true);
  });

  it("rejette une session invalide et les chemins hors workspace", async () => {
    await setupSessionFiles();
    const badSession = createPackDraft("not-a-uuid", {
      title: "OK",
      author: "Auteur",
    });
    const withStory = addStoryToPack(badSession, {
      id: "a",
      title: "H",
      storyAudioPath: audio,
      coverImagePath: cover,
    });
    const invalidSession = validatePackDraft(withStory);
    expect(invalidSession.ok).toBe(false);
    if (!invalidSession.ok) expect(invalidSession.code).toBe("INVALID_SESSION");

    let pack = createPackDraft(SESSION_ID, { title: "OK", author: "Auteur" });
    pack = addStoryToPack(pack, {
      id: "a",
      title: "H",
      storyAudioPath: fixtureAudio,
      coverImagePath: cover,
    });
    const outside = validatePackDraft(pack);
    expect(outside.ok).toBe(false);
    if (!outside.ok) expect(outside.code).toBe("INVALID_PACK");
  });
});
