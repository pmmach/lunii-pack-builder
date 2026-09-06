# Spec 03 — Assemblage du pack et export

Contexte : format cible détaillé dans `requirements/02-format-pack-lunii.md` (format STUdio final, généré directement — `story.json` + `assets/`). Dépend de la spec 02 (fichiers `story.mp3`/`cover.jpg` déjà générés dans `workspace/<sessionId>/processed/<episodeId>/`).

## Objectif

Construire, à partir d'une ou plusieurs histoires préparées, le graphe STUdio (`story.json`) et copier les assets référencés, puis compresser le tout en `.zip` téléchargeable — directement utilisable dans [Lunii Admin Builder](https://lunii-admin-builder.pages.dev/) (import) ou [Lunii Admin Web](https://lunii-admin-web.pages.dev/) (installation sur l'appareil).

## Règle par défaut pour l'intro (`titleAudioPath`)

Le besoin initial distingue une "intro" (jouée en sélectionnant l'histoire) du contenu de l'histoire (`storyAudioPath`). Par défaut, en l'absence de sélection explicite d'un extrait dédié par l'utilisateur dans l'éditeur (spec 04) :

> intro = les **8 premières secondes** de `storyAudioPath` (constante `DEFAULT_TITLE_CLIP_SECONDS = 8`, dans `src/lib/pack/constants.ts`), produites avec la même fonction `trimAudio` que la spec 02 (copie de flux si la source est déjà MP3).

Si l'utilisateur a explicitement fourni un `titleAudioPath` distinct (généré par l'éditeur de la spec 04 via un second appel à `trimAudio`), celui-ci est utilisé tel quel.

## Types (`src/lib/pack/types.ts`)

```typescript
export interface StoryDraft {
  id: string;                 // = episodeId
  order: number;
  title: string;
  storyAudioPath: string;      // chemin absolu vers story.mp3 (spec 02)
  titleAudioPath?: string;      // chemin absolu vers un extrait d'intro dédié, sinon dérivé par défaut
  coverImagePath: string;       // chemin absolu vers cover.jpg 320x320 (spec 02)
}

export interface PackDraft {
  sessionId: string;
  uuid: string;                // uuid v4, généré à la création du pack
  title: string;
  author: string;              // obligatoire (format STUdio) ; auto-rempli depuis la source (RSS), éditable dans l'UI
  description?: string;
  coverImagePath: string;       // vignette du pack (par défaut : cover de la 1ère histoire) ; utilisée seulement si >1 histoire (cf. studio-format.ts)
  titleAudioPath?: string;       // intro du pack (optionnel) ; utilisée seulement si >1 histoire
  stories: StoryDraft[];
}
```

## Fonctions (`src/lib/pack/builder.ts`)

```typescript
export function createPackDraft(sessionId: string, meta: { title: string; author?: string; description?: string }): PackDraft;
export function addStoryToPack(pack: PackDraft, story: Omit<StoryDraft, "order">): PackDraft;
export function removeStoryFromPack(pack: PackDraft, storyId: string): PackDraft;
export function reorderStories(pack: PackDraft, orderedIds: string[]): PackDraft;

export function validatePackDraft(pack: PackDraft): Result<true>;
```

- `createPackDraft` génère `uuid` avec `uuid.v4()`, initialise `stories: []`, `author: meta.author ?? ""`
- `addStoryToPack` : si aucune histoire n'existait avant, définit aussi `pack.coverImagePath` sur celle de la nouvelle histoire si non déjà définie ; `order = stories.length`
- `reorderStories` : réassigne `order` selon l'ordre du tableau `orderedIds` fourni ; ignore silencieusement les ids inconnus
- `validatePackDraft` vérifie : `title` non vide, `author` non vide, `stories.length >= 1`, chaque `StoryDraft` a un `title` non vide et des chemins de fichiers existants sur le disque → sinon `err("<raison précise>", "INVALID_PACK")`
- `validate-client.ts` porte la même règle (sans vérification filesystem) pour la validation côté client avant l'appel serveur

## Construction du graphe STUdio (`src/lib/pack/studio-format.ts`)

```typescript
export interface StudioStageNode { type: "cover" | "menu" | "story"; uuid: string; audio: string | null; image: string | null; name: string; okTransition: { actionNode: string; optionIndex: number } | null; homeTransition: { actionNode: string; optionIndex: number } | null; controlSettings: { wheel: boolean; ok: boolean; home: boolean; pause: boolean; autoplay: boolean }; squareOne?: boolean }
export interface StudioActionNode { id: string; uuid: string; name: string; options: string[] }
export interface StudioPack { format: "v1"; version: 2; uuid: string; title: string; author: string; description: string; source: "LUNII_PACK_BUILDER"; stageNodes: StudioStageNode[]; actionNodes: StudioActionNode[] }
export interface AssetCopyPlan { sourcePath: string; assetFileName: string }

export function randomAssetId(length?: number): string;
export function buildStudioPack(pack: PackDraft): { studioPack: StudioPack; assets: AssetCopyPlan[] };
```

Pure (aucun accès disque) : `buildStudioPack` construit uniquement l'objet JSON et la liste des copies d'assets à effectuer ; `pack.stories` doivent déjà avoir un `titleAudioPath` résolu (voir `write-to-disk.ts`).

- `randomAssetId()` génère un identifiant de 10 caractères alphanumériques (imite le nommage observé dans un pack réel, ex: `1Lh78QsHxV`) ; chaque asset copié reçoit un nom `<randomAssetId()><extension d'origine>`
- **1 histoire** : stage node `cover` (uuid = `pack.uuid`, `squareOne: true`, image+intro de **cette histoire**) → action `toStory` → stage node `story` (image `null`) → action `backToCover` (options: `[cover]`) ; sur le story, **`okTransition` = `homeTransition` = backToCover** (équivalent `onEnd: "back"`, évite l'erreur SD en fin d'autoplay). Total : 2 stage nodes, **2** action nodes
- **N histoires (N>1)** : `cover` (image/intro du **pack**) → action racine (N options) → pour chaque histoire : `menu` (image/intro, `homeTransition: null`) → action → `story` (image `null`) avec **`okTransition` = `homeTransition` = `{ actionNode: <action racine>, optionIndex: <index> }`**. Total : 1 + 2N stage nodes, N+1 action nodes
- `controlSettings` fixes : `{wheel:true,ok:true,home:true,pause:false,autoplay:false}` pour `cover`/`menu`, `{wheel:false,ok:false,home:true,pause:true,autoplay:true}` pour `story`
- Sur `cover`/`menu` : `homeTransition` reste `null` (Maison → bibliothèque appareil)

## Écriture sur disque (`src/lib/pack/write-to-disk.ts`)

```typescript
export async function writePackToDisk(pack: PackDraft, destDir: string): Promise<Result<{ packDir: string }>>;
```

Étapes :

1. Appeler `validatePackDraft`, retourner l'erreur telle quelle si invalide
2. Calculer `packSlug = slugify(pack.title)` ; si un dossier `destDir/<packSlug>` existe déjà, suffixer `-2`, `-3`, etc. jusqu'à obtenir un nom libre ; créer `destDir/<packSlug>/assets/`
3. Pour chaque histoire sans `titleAudioPath`, générer l'extrait par défaut (8 premières secondes, cf. règle ci-dessus) dans un dossier temporaire `destDir/.tmp-<packSlug>/`, puis résoudre un `PackDraft` où chaque histoire a un `titleAudioPath` défini
4. Appeler `buildStudioPack` sur ce pack résolu
5. Copier chaque asset planifié (`asset.sourcePath` → `destDir/<packSlug>/assets/<asset.assetFileName>`)
6. Écrire `destDir/<packSlug>/story.json` = `JSON.stringify(studioPack)` (minifié, comme le format observé)
7. Supprimer le dossier temporaire (`finally`)
8. Retourner `ok({ packDir: destDir/<packSlug> })`

Toute erreur d'I/O au milieu du processus doit déclencher un nettoyage du dossier `packDir` partiellement créé avant de retourner l'erreur (éviter les packs à moitié écrits qui traîneraient sur le disque).

## Compression (`src/lib/pack/zip.ts`)

```typescript
export async function zipPackDirectory(packDir: string, outputZipPath: string): Promise<Result<{ zipPath: string; sizeBytes: number }>>;
```

- Utiliser `archiver("zip", { zlib: { level: 9 } })`, ajouter récursivement le contenu de `packDir` **à la racine de l'archive** (`archive.directory(packDir, false)` — pas de dossier `<packSlug>/` dans le zip : `story.json` et `assets/` doivent être directement à la racine, c'est ce qu'attend l'import de Lunii Admin Builder)
- Écrire vers un stream fichier, résoudre la Promise sur l'event `close` du stream, rejeter sur `error`

## Route de téléchargement (`src/app/api/download/[sessionId]/route.ts`)

```typescript
export async function GET(req: Request, { params }: { params: { sessionId: string } }): Promise<Response>;
```

- Vérifie qu'un zip existe déjà pour cette session (généré par la Server Action `exportPackAction`, voir ci-dessous) ; sinon 404
- Stream le fichier avec les headers : `Content-Type: application/zip`, `Content-Disposition: attachment; filename="<packSlug>.zip"` (le nom de fichier téléchargé garde le slug du pack, même si le contenu du zip n'a pas de dossier racine)
- Après l'envoi complet (event `close` de la réponse), planifier la suppression du dossier `workspace/<sessionId>/` après `env.WORKSPACE_TTL_MINUTES` minutes (pas immédiatement, au cas où l'utilisateur relance le téléchargement)

## Server Action (`src/lib/actions/export-pack.ts`)

```typescript
"use server";
export async function exportPackAction(pack: PackDraft): Promise<Result<{ downloadUrl: string; sizeBytes: number }>>;
```

- Enchaîne `writePackToDisk` (vers `workspace/<sessionId>/pack/`) puis `zipPackDirectory` (vers `workspace/<sessionId>/export.zip`)
- Retourne `downloadUrl: "/api/download/<sessionId>"`

## Auteur du pack (UI)

- `SourceResolution.showAuthor` (optionnel) est extrait du flux RSS (`itunes:author`, `managingEditor` ou `creator` du canal) dans `src/lib/sources/rss.ts`
- À la résolution de la source, `SessionState.packAuthor` est initialisé avec `source.showAuthor ?? ""`
- Un champ "Auteur" éditable est affiché à l'étape 4 (composition du pack, `src/app/pack/[sessionId]/page.tsx`), à côté de "Titre du pack" et "Description" ; le bouton "Générer le pack" est désactivé tant qu'il est vide

## Tests

- `builder.test.ts` : construit un `PackDraft` avec 2 histoires, teste `reorderStories`, `removeStoryFromPack`, et les cas d'invalidité de `validatePackDraft` (titre vide, auteur vide, aucune histoire, fichier manquant)
- `studio-format.test.ts` : vérifie le graphe pour 1 histoire (2 stage nodes, **2** action nodes, `okTransition`/`homeTransition` du story → cover) et pour plusieurs histoires (1 cover + N×(menu+story), N+1 action nodes, `okTransition` = `homeTransition` vers le menu racine)
- `write-to-disk.test.ts` : dossier temporaire + fixtures ; vérifie `assets/` + `story.json`, références d'assets cohérentes, collisions de noms, et les transitions de retour menu
- `zip.test.ts` : zippe un dossier de test (`story.json` + `assets/`), relit avec `yauzl` pour vérifier les entrées à la racine (pas de préfixe `<packSlug>/`)

## Critère d'acceptation manuel

Générer un pack (1 histoire, puis plusieurs histoires) de bout en bout, télécharger le `.zip`, l'**importer** dans [Lunii Admin Builder](https://lunii-admin-builder.pages.dev/) : l'import doit réussir et afficher le bon graphe. Installer sur l'appareil Lunii et **écouter jusqu'à la fin** : pas d'« erreur carte SD » — retour attendu au cover (1 histoire) ou au menu du pack (multi). Le cas multi-histoires sur appareil reste à valider manuellement si besoin.
