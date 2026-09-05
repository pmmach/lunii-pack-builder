import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  addStoryToPack,
  createPackDraft,
  removeStoryFromPack,
  reorderStories,
  validatePackDraft,
} from "./builder";

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

describe("pack builder", () => {
  it("ajoute, réordonne et retire des histoires", () => {
    let pack = createPackDraft("sess-1", { title: "Mon pack" });
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

  it("valide les cas d'invalidité", () => {
    const emptyTitle = createPackDraft("s", { title: "  " });
    expect(validatePackDraft(emptyTitle).ok).toBe(false);

    let pack = createPackDraft("s", { title: "OK" });
    expect(validatePackDraft(pack).ok).toBe(false);

    pack = addStoryToPack(pack, {
      id: "a",
      title: "H",
      storyAudioPath: "/no/such/file.mp3",
      coverImagePath: cover,
    });
    expect(validatePackDraft(pack).ok).toBe(false);

    pack = createPackDraft("s", { title: "OK" });
    pack = addStoryToPack(pack, {
      id: "a",
      title: "H",
      storyAudioPath: audio,
      coverImagePath: cover,
    });
    expect(validatePackDraft(pack).ok).toBe(true);
  });
});
