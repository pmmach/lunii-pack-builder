import { describe, expect, it } from "vitest";
import { resolvePackCoverImagePath } from "./cover";

const stories = [
  { id: "a", coverImagePath: "/covers/a.jpg" },
  { id: "b", coverImagePath: "/covers/b.jpg" },
];

describe("resolvePackCoverImagePath", () => {
  it("auto : retourne l'image de la première histoire", () => {
    const resolved = resolvePackCoverImagePath({ type: "auto" }, stories);
    expect(resolved.path).toBe("/covers/a.jpg");
    expect(resolved.effectiveSource).toEqual({ type: "auto" });
  });

  it("story : retourne l'image de l'histoire épinglée", () => {
    const cover = { type: "story" as const, storyId: "b" };
    const resolved = resolvePackCoverImagePath(cover, stories);
    expect(resolved.path).toBe("/covers/b.jpg");
    expect(resolved.effectiveSource).toEqual(cover);
  });

  it("story absente : retombe sur auto", () => {
    const resolved = resolvePackCoverImagePath(
      { type: "story", storyId: "missing" },
      stories
    );
    expect(resolved.path).toBe("/covers/a.jpg");
    expect(resolved.effectiveSource).toEqual({ type: "auto" });
  });

  it("upload : retourne le chemin fourni tel quel", () => {
    const cover = {
      type: "upload" as const,
      path: "/workspace/pack-cover/upload.jpg",
      url: "/api/workspace/s/pack-cover/upload.jpg",
    };
    const resolved = resolvePackCoverImagePath(cover, stories);
    expect(resolved.path).toBe(cover.path);
    expect(resolved.effectiveSource).toEqual(cover);
  });
});
