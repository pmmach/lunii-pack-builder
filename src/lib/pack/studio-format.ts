import { randomBytes } from "node:crypto";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import type { PackDraft } from "./types";

/**
 * Format STUdio final (celui produit par Lunii Admin Builder / consommé par
 * Lunii Admin Web pour l'installation sur l'appareil). Schéma reconstitué à
 * partir d'un pack réel et du code source de olup/lunii-admin-builder
 * (src/utils/generate/generate.ts, src/types.ts) — voir
 * `requirements/02-format-pack-lunii.md` pour l'analyse détaillée.
 */

export interface StudioTransition {
  actionNode: string;
  optionIndex: number;
}

export interface StudioControlSettings {
  wheel: boolean;
  ok: boolean;
  home: boolean;
  pause: boolean;
  autoplay: boolean;
}

export interface StudioStageNode {
  type: "cover" | "menu" | "story";
  uuid: string;
  audio: string | null;
  image: string | null;
  name: string;
  okTransition: StudioTransition | null;
  homeTransition: StudioTransition | null;
  controlSettings: StudioControlSettings;
  squareOne?: boolean;
}

export interface StudioActionNode {
  id: string;
  uuid: string;
  name: string;
  options: string[];
}

export interface StudioPack {
  format: "v1";
  version: 2;
  uuid: string;
  title: string;
  author: string;
  description: string;
  source: "LUNII_PACK_BUILDER";
  stageNodes: StudioStageNode[];
  actionNodes: StudioActionNode[];
}

export interface AssetCopyPlan {
  sourcePath: string;
  assetFileName: string;
}

const MENU_CONTROL_SETTINGS: StudioControlSettings = {
  wheel: true,
  ok: true,
  home: true,
  pause: false,
  autoplay: false,
};

const STORY_CONTROL_SETTINGS: StudioControlSettings = {
  wheel: false,
  ok: false,
  home: true,
  pause: true,
  autoplay: true,
};

const ASSET_ID_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Génère un identifiant court aléatoire pour un nom de fichier dans assets/ (imite le format observé, ex: "1Lh78QsHxV"). */
export function randomAssetId(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const byte of bytes) {
    out += ASSET_ID_CHARS[byte % ASSET_ID_CHARS.length] ?? "";
  }
  return out;
}

/**
 * Construit le graphe STUdio (story.json) et la liste des copies d'assets à
 * effectuer, à partir d'un PackDraft déjà résolu (chaque StoryDraft doit
 * porter un titleAudioPath défini — voir write-to-disk.ts pour la génération
 * de l'extrait par défaut en amont de cet appel).
 *
 * - 1 seule histoire : le noeud "cover" du pack reprend directement l'image
 *   et l'intro de cette histoire (comportement observé sur un pack réel).
 * - Plusieurs histoires : le noeud "cover" (racine) porte l'image/intro du
 *   pack, chaque histoire devient un noeud "menu" intermédiaire (sa propre
 *   image/intro) pointant vers son noeud "story" (le contenu audio seul).
 */
export function buildStudioPack(pack: PackDraft): {
  studioPack: StudioPack;
  assets: AssetCopyPlan[];
} {
  const assets: AssetCopyPlan[] = [];

  function registerAsset(sourcePath: string): string {
    const ext = path.extname(sourcePath);
    const assetFileName = `${randomAssetId()}${ext}`;
    assets.push({ sourcePath, assetFileName });
    return assetFileName;
  }

  function registerOptionalAsset(sourcePath?: string): string | null {
    return sourcePath ? registerAsset(sourcePath) : null;
  }

  const stageNodes: StudioStageNode[] = [];
  const actionNodes: StudioActionNode[] = [];
  const sortedStories = [...pack.stories].sort((a, b) => a.order - b.order);
  const packUuid = pack.uuid;

  if (sortedStories.length === 1) {
    const [story] = sortedStories;
    if (!story) throw new Error("Histoire manquante");
    const actionUuid = uuidv4();
    const storyUuid = uuidv4();

    stageNodes.push({
      uuid: packUuid,
      image: registerAsset(story.coverImagePath),
      audio: registerOptionalAsset(story.titleAudioPath),
      type: "cover",
      name: packUuid,
      okTransition: { actionNode: actionUuid, optionIndex: 0 },
      homeTransition: null,
      controlSettings: MENU_CONTROL_SETTINGS,
      squareOne: true,
    });

    actionNodes.push({
      id: actionUuid,
      uuid: actionUuid,
      name: actionUuid,
      options: [storyUuid],
    });

    stageNodes.push({
      uuid: storyUuid,
      image: null,
      audio: registerAsset(story.storyAudioPath),
      type: "story",
      name: storyUuid,
      okTransition: null,
      homeTransition: null,
      controlSettings: STORY_CONTROL_SETTINGS,
    });
  } else {
    const rootActionUuid = uuidv4();

    stageNodes.push({
      uuid: packUuid,
      image: registerAsset(pack.coverImagePath),
      audio: registerOptionalAsset(pack.titleAudioPath),
      type: "cover",
      name: packUuid,
      okTransition: { actionNode: rootActionUuid, optionIndex: 0 },
      homeTransition: null,
      controlSettings: MENU_CONTROL_SETTINGS,
      squareOne: true,
    });

    const rootOptions: string[] = [];

    sortedStories.forEach((story, index) => {
      const menuUuid = uuidv4();
      const menuActionUuid = uuidv4();
      const leafUuid = uuidv4();
      rootOptions.push(menuUuid);

      stageNodes.push({
        uuid: menuUuid,
        image: registerAsset(story.coverImagePath),
        audio: registerOptionalAsset(story.titleAudioPath),
        type: "menu",
        name: menuUuid,
        okTransition: { actionNode: menuActionUuid, optionIndex: 0 },
        homeTransition: null,
        controlSettings: MENU_CONTROL_SETTINGS,
      });

      actionNodes.push({
        id: menuActionUuid,
        uuid: menuActionUuid,
        name: menuActionUuid,
        options: [leafUuid],
      });

      stageNodes.push({
        uuid: leafUuid,
        image: null,
        audio: registerAsset(story.storyAudioPath),
        type: "story",
        name: leafUuid,
        okTransition: null,
        homeTransition: { actionNode: rootActionUuid, optionIndex: index },
        controlSettings: STORY_CONTROL_SETTINGS,
      });
    });

    actionNodes.push({
      id: rootActionUuid,
      uuid: rootActionUuid,
      name: rootActionUuid,
      options: rootOptions,
    });
  }

  const studioPack: StudioPack = {
    format: "v1",
    version: 2,
    uuid: packUuid,
    title: pack.title,
    author: pack.author,
    description: pack.description ?? "",
    source: "LUNII_PACK_BUILDER",
    stageNodes,
    actionNodes,
  };

  return { studioPack, assets };
}
