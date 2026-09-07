export type PackCoverSource =
  | { type: "auto" }
  | { type: "story"; storyId: string }
  | { type: "upload"; path: string; url: string };

export interface PackCoverResolution {
  path: string;
  /** Source effectivement utilisée : peut différer de l'entrée si l'histoire épinglée a été retirée du pack. */
  effectiveSource: PackCoverSource;
}

export function resolvePackCoverImagePath(
  cover: PackCoverSource,
  stories: { id: string; coverImagePath: string }[]
): PackCoverResolution {
  if (stories.length === 0) {
    return { path: "", effectiveSource: { type: "auto" } };
  }

  if (cover.type === "upload") {
    return { path: cover.path, effectiveSource: cover };
  }

  if (cover.type === "story") {
    const pinned = stories.find((story) => story.id === cover.storyId);
    if (pinned) {
      return { path: pinned.coverImagePath, effectiveSource: cover };
    }
  }

  const first = stories[0];
  return {
    path: first?.coverImagePath ?? "",
    effectiveSource: { type: "auto" },
  };
}
