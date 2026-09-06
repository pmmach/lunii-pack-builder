import path from "node:path";
import { describe, expect, it } from "vitest";
import { addStoryToPack, createPackDraft } from "./builder";
import { buildStudioPack, randomAssetId } from "./studio-format";

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

describe("randomAssetId", () => {
  it("génère des identifiants uniques de la longueur attendue", () => {
    const a = randomAssetId();
    const b = randomAssetId();
    expect(a).toHaveLength(10);
    expect(a).toMatch(/^[A-Za-z0-9]+$/);
    expect(a).not.toBe(b);
  });
});

describe("buildStudioPack — 1 histoire", () => {
  it("construit un cover + un story avec retour au cover en fin de lecture", () => {
    let pack = createPackDraft("sess", { title: "Pack", author: "Auteur" });
    pack = addStoryToPack(pack, {
      id: "1",
      title: "Histoire",
      storyAudioPath: audio,
      coverImagePath: cover,
      titleAudioPath: audio,
    });

    const { studioPack, assets } = buildStudioPack(pack);

    expect(studioPack.stageNodes).toHaveLength(2);
    expect(studioPack.actionNodes).toHaveLength(2);

    const [coverNode, storyNode] = studioPack.stageNodes;
    if (!coverNode || !storyNode) throw new Error("Noeuds manquants");
    expect(coverNode.type).toBe("cover");
    expect(coverNode.uuid).toBe(pack.uuid);
    expect(coverNode.squareOne).toBe(true);
    expect(coverNode.homeTransition).toBeNull();
    expect(coverNode.controlSettings).toEqual({
      wheel: true,
      ok: true,
      home: true,
      pause: false,
      autoplay: false,
    });

    expect(storyNode.type).toBe("story");
    expect(storyNode.image).toBeNull();
    expect(storyNode.controlSettings).toEqual({
      wheel: false,
      ok: false,
      home: true,
      pause: true,
      autoplay: true,
    });

    const toStoryAction = studioPack.actionNodes.find(
      (a) => a.id === coverNode.okTransition?.actionNode
    );
    if (!toStoryAction) throw new Error("Action cover→story manquante");
    expect(toStoryAction.options).toEqual([storyNode.uuid]);

    const backAction = studioPack.actionNodes.find(
      (a) => a.id === storyNode.okTransition?.actionNode
    );
    if (!backAction) throw new Error("Action story→cover manquante");
    expect(backAction.options).toEqual([pack.uuid]);
    expect(storyNode.okTransition).toEqual({
      actionNode: backAction.id,
      optionIndex: 0,
    });
    expect(storyNode.homeTransition).toEqual(storyNode.okTransition);

    // 1 image (cover) + 1 audio (intro) + 1 audio (story) = 3 assets planifiés
    expect(assets).toHaveLength(3);
    const names = new Set(assets.map((a) => a.assetFileName));
    expect(names.size).toBe(3); // tous uniques
  });
});

describe("buildStudioPack — plusieurs histoires", () => {
  it("construit un menu racine + un menu/story par histoire avec retour menu", () => {
    let pack = createPackDraft("sess", { title: "Pack", author: "Auteur" });
    pack = addStoryToPack(pack, {
      id: "1",
      title: "Histoire 1",
      storyAudioPath: audio,
      coverImagePath: cover,
      titleAudioPath: audio,
    });
    pack = addStoryToPack(pack, {
      id: "2",
      title: "Histoire 2",
      storyAudioPath: audio,
      coverImagePath: cover,
      titleAudioPath: audio,
    });
    pack = { ...pack, titleAudioPath: audio };

    const { studioPack } = buildStudioPack(pack);

    expect(studioPack.stageNodes).toHaveLength(5); // cover + 2*(menu+story)
    expect(studioPack.actionNodes).toHaveLength(3); // racine + 1 par histoire

    const [rootCover] = studioPack.stageNodes;
    if (!rootCover) throw new Error("Noeud cover manquant");
    expect(rootCover.type).toBe("cover");
    expect(rootCover.uuid).toBe(pack.uuid);
    expect(rootCover.audio).toBeTruthy();

    const rootAction = studioPack.actionNodes.find(
      (a) => a.id === rootCover.okTransition?.actionNode
    );
    expect(rootAction?.options).toHaveLength(2);

    const menus = studioPack.stageNodes.filter((n) => n.type === "menu");
    expect(menus).toHaveLength(2);
    menus.forEach((menu) => {
      expect(menu.homeTransition).toBeNull();
      expect(menu.image).toBeTruthy();
    });

    const stories = studioPack.stageNodes.filter((n) => n.type === "story");
    expect(stories).toHaveLength(2);
    stories.forEach((story, index) => {
      const back = {
        actionNode: rootAction?.id,
        optionIndex: index,
      };
      expect(story.homeTransition).toEqual(back);
      expect(story.okTransition).toEqual(back);
    });
  });
});
