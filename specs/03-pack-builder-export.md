# Spec 03 — Assemblage du pack et export

Contexte : format cible détaillé dans `requirements/02-format-pack-lunii.md`. Dépend de la spec 02 (fichiers `story.mp3`/`cover.jpg` déjà générés dans `workspace/<sessionId>/processed/<episodeId>/`).

## Objectif

Construire, à partir d'une ou plusieurs histoires préparées, l'arborescence de dossiers attendue par le créateur de pack de Lunii Admin Web, puis la compresser en `.zip` téléchargeable.

## Règle par défaut pour `title.mp3` (intro)

Le besoin initial distingue une "intro" (`title.mp3`) du contenu de l'histoire (`story.mp3`). Par défaut, en l'absence de sélection explicite d'un extrait dédié par l'utilisateur dans l'éditeur (spec 04) :

> `title.mp3` = les **8 premières secondes** de `story.mp3` (constante `DEFAULT_TITLE_CLIP_SECONDS = 8`, dans `src/lib/pack/constants.ts`), réencodées avec la même fonction `trimAudio` que la spec 02.

Si l'utilisateur a explicitement fourni un `titleAudioPath` distinct (généré par l'éditeur de la spec 04 via un second appel à `trimAudio`), celui-ci est utilisé tel quel.

## Types (`src/lib/pack/types.ts`)

```typescript
export interface StoryDraft {
  id: string;                 // = episodeId
  order: number;
  title: string;
  storyAudioPath: string;      // chemin absolu vers story.mp3 (spec 02)
  titleAudioPath?: string;      // chemin absolu vers un title.mp3 dédié, sinon dérivé par défaut
  coverImagePath: string;       // chemin absolu vers cover.jpg 320x320 (spec 02)
}

export interface PackDraft {
  sessionId: string;
  uuid: string;                // uuid v4, généré à la création du pack
  title: string;
  description?: string;
  coverImagePath: string;       // vignette du pack (par défaut : cover de la 1ère histoire)
  titleAudioPath?: string;       // audio du pack (optionnel ; si absent, non inclus)
  stories: StoryDraft[];
}
```

## Fonctions (`src/lib/pack/builder.ts`)

```typescript
export function createPackDraft(sessionId: string, meta: { title: string; description?: string }): PackDraft;
export function addStoryToPack(pack: PackDraft, story: Omit<StoryDraft, "order">): PackDraft;
export function removeStoryFromPack(pack: PackDraft, storyId: string): PackDraft;
export function reorderStories(pack: PackDraft, orderedIds: string[]): PackDraft;

export function validatePackDraft(pack: PackDraft): Result<true>;
```

- `createPackDraft` génère `uuid` avec `uuid.v4()`, initialise `stories: []`
- `addStoryToPack` : si aucune histoire n'existait avant, définit aussi `pack.coverImagePath` sur celle de la nouvelle histoire si non déjà définie ; `order = stories.length`
- `reorderStories` : réassigne `order` selon l'ordre du tableau `orderedIds` fourni ; ignore silencieusement les ids inconnus
- `validatePackDraft` vérifie : `title` non vide, `stories.length >= 1`, chaque `StoryDraft` a un `title` non vide et des chemins de fichiers existants sur le disque → sinon `err("<raison précise>", "INVALID_PACK")`

## Écriture sur disque (`src/lib/pack/write-to-disk.ts`)

```typescript
export async function writePackToDisk(pack: PackDraft, destDir: string): Promise<Result<{ packDir: string }>>;
```

Étapes :

1. Appeler `validatePackDraft`, retourner l'erreur telle quelle si invalide
2. Calculer `packSlug = slugify(pack.title)` ; si un dossier `destDir/<packSlug>` existe déjà, suffixer `-2`, `-3`, etc. jusqu'à obtenir un nom libre
3. Créer `destDir/<packSlug>/`
4. Copier `pack.coverImagePath` → `destDir/<packSlug>/cover.jpeg`
5. Si `pack.titleAudioPath` est défini, le copier → `destDir/<packSlug>/title.mp3` (sinon ce fichier est omis au niveau du pack — le format le permet, cf. `requirements/02-format-pack-lunii.md`, seul le niveau histoire est obligatoire)
6. Écrire `destDir/<packSlug>/md.yaml` via `js-yaml` :
   ```yaml
   title: <pack.title>
   description: <pack.description ou "">
   uuid: <pack.uuid>
   ```
7. Pour chaque histoire (dans l'ordre de `order`) :
   - `storySlug = slugify(story.title)` (même règle anti-collision qu'à l'étape 2, à l'intérieur du dossier pack)
   - Créer `destDir/<packSlug>/<storySlug>/`
   - Copier `story.coverImagePath` → `.../cover.jpeg`
   - Copier `story.storyAudioPath` → `.../story.mp3`
   - Si `story.titleAudioPath` défini, le copier → `.../title.mp3` ; **sinon**, appeler `trimAudio(story.storyAudioPath, ".../title.mp3", { startSeconds: 0, endSeconds: min(DEFAULT_TITLE_CLIP_SECONDS, duréeRéelle) })` (voir spec 02) pour générer l'extrait par défaut
8. Retourner `ok({ packDir: destDir/<packSlug> })`

Toute erreur d'I/O au milieu du processus doit déclencher un nettoyage du dossier partiellement créé avant de retourner l'erreur (éviter les packs à moitié écrits qui traîneraient sur le disque).

## Compression (`src/lib/pack/zip.ts`)

```typescript
export async function zipPackDirectory(packDir: string, outputZipPath: string): Promise<Result<{ zipPath: string; sizeBytes: number }>>;
```

- Utiliser `archiver("zip", { zlib: { level: 9 } })`, ajouter récursivement `packDir` à la racine de l'archive (le zip doit contenir directement `<packSlug>/...`, pas de dossier parent superflu)
- Écrire vers un stream fichier, résoudre la Promise sur l'event `close` du stream, rejeter sur `error`

## Route de téléchargement (`src/app/api/download/[sessionId]/route.ts`)

```typescript
export async function GET(req: Request, { params }: { params: { sessionId: string } }): Promise<Response>;
```

- Vérifie qu'un zip existe déjà pour cette session (généré par la Server Action `exportPackAction`, voir ci-dessous) ; sinon 404
- Stream le fichier avec les headers : `Content-Type: application/zip`, `Content-Disposition: attachment; filename="<packSlug>.zip"`
- Après l'envoi complet (event `close` de la réponse), planifier la suppression du dossier `workspace/<sessionId>/` après `env.WORKSPACE_TTL_MINUTES` minutes (pas immédiatement, au cas où l'utilisateur relance le téléchargement)

## Server Action (`src/lib/actions/export-pack.ts`)

```typescript
"use server";
export async function exportPackAction(pack: PackDraft): Promise<Result<{ downloadUrl: string; sizeBytes: number }>>;
```

- Enchaîne `writePackToDisk` (vers `workspace/<sessionId>/pack/`) puis `zipPackDirectory` (vers `workspace/<sessionId>/export.zip`)
- Retourne `downloadUrl: "/api/download/<sessionId>"`

## Tests

- `builder.test.ts` : construit un `PackDraft` avec 2 histoires, teste `reorderStories`, `removeStoryFromPack`, et les cas d'invalidité de `validatePackDraft` (titre vide, aucune histoire, fichier manquant)
- `write-to-disk.test.ts` : utilise un dossier temporaire (`fs.mkdtemp`) et des fixtures audio/image de la spec 02 ; vérifie que l'arborescence produite correspond **exactement** à celle documentée dans `requirements/02-format-pack-lunii.md` (noms de fichiers, présence de `md.yaml` avec les 3 clés attendues, génération automatique du `title.mp3` par défaut quand non fourni) ; teste aussi la gestion de collision de noms de dossiers
- `zip.test.ts` : zippe un dossier de test, relit l'archive avec `yauzl` (dev dependency) pour vérifier la liste des entrées attendues et l'absence de dossier racine superflu

## Critère d'acceptation manuel

Générer un pack à une histoire de bout en bout, télécharger le `.zip`, l'importer dans [Lunii Admin Web](https://lunii-admin-web.pages.dev/) via le bouton "create pack" : l'opération doit réussir sans erreur et produire un pack installable sur l'appareil.
