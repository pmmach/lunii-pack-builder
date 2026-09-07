# Spec 02 — Pipeline média (téléchargement, trim, image, waveform)

Contexte : `plan/01-architecture.md` (module `lib/media/`), formats cibles dans `requirements/02-format-pack-lunii.md`.

## Objectif

Télécharger l'audio/l'image d'un épisode sélectionné dans l'espace de travail de la session, permettre un découpage (trim) de l'audio, générer les vignettes 320x320 et les données de waveform pour l'éditeur visuel (spec 04). La **préparation** (téléchargement + waveform + vignette) est suivie via un tracker de job ; la **découpe** est synchrone (pas de job) pour éviter le coût du polling.

## Espace de travail

Chaque session utilisateur a un dossier `workspace/<sessionId>/` (créé au premier appel) :

```
workspace/<sessionId>/
  source/<episodeId>/
    audio.<ext>          # audio brut téléchargé
    cover.<ext>           # image brute téléchargée
  processed/<episodeId>/
    source.mp3             # audio normalisé MP3 (conversion unique à la préparation)
    story.mp3              # audio final après trim (copie de flux depuis source.mp3)
    title.mp3               # extrait "intro" (voir spec 03 pour la règle par défaut)
    cover.jpg               # image recadrée 320x320
```

`sessionId` est un UUID v4 généré côté serveur à la première résolution de source (spec 01), transmis au client et réutilisé pour toutes les opérations suivantes.

## Types (`src/lib/media/types.ts`)

```typescript
export interface DownloadResult {
  filePath: string;
  mimeType: string;
  sizeBytes: number;
}

export interface TrimOptions {
  startSeconds: number;
  endSeconds: number;
}

export interface AudioProcessResult {
  filePath: string;
  durationSeconds: number;
}

export interface ImageCropOptions {
  sourcePath: string;
  outputPath: string;
  size?: number;       // défaut 320
  focusX?: number;      // 0..1, défaut 0.5 (centré)
  focusY?: number;      // 0..1, défaut 0.5
}
```

## Fonctions

### `src/lib/media/download.ts`

```typescript
export async function downloadToWorkspace(
  url: string,
  destPath: string,
  kind: "audio" | "image"
): Promise<Result<DownloadResult>>;
```

- Réutilise le garde anti-SSRF de `src/lib/sources/url-guard.ts` (spec 01) avant tout fetch
- Stream la réponse directement sur disque (`fs.createWriteStream` + `Readable.fromWeb(response.body).pipe(...)`), jamais de buffer complet en mémoire
- Vérifie le `Content-Type` de la réponse : doit commencer par `audio/` (kind `"audio"`) ou `image/` (kind `"image"`) — sinon `err("Le fichier distant n'est pas au format attendu", "INVALID_CONTENT_TYPE")`
- Applique une limite de taille (`env.MAX_DOWNLOAD_MB`) : si dépassée pendant le stream, annule et supprime le fichier partiel, retourne `err("Fichier trop volumineux", "FILE_TOO_LARGE")`
- Timeout d'inactivité : `env.DOWNLOAD_TIMEOUT_MS` (défaut 300s) pour l'audio, 60s pour les images ; le timer est **relancé à chaque chunk** reçu (un gros fichier lent mais progressant ne timeout pas) ; si le flux reste silencieux trop longtemps → `err("Délai dépassé lors du téléchargement", "TIMEOUT")`

### `src/lib/media/trim.ts`

```typescript
export async function trimAudio(
  inputPath: string,
  outputPath: string,
  opts: TrimOptions,
  onProgress?: (percent: number) => void
): Promise<Result<AudioProcessResult>>;

export async function ensureMp3(
  inputPath: string,
  outputPath: string,
  onProgress?: (percent: number) => void
): Promise<Result<AudioProcessResult>>;

export async function probeDuration(inputPath: string): Promise<Result<number>>;
```

- Utilise `fluent-ffmpeg` (binaire fourni par `@ffmpeg-installer/ffmpeg`, à enregistrer via `ffmpeg.setFfmpegPath(...)`)
- `opts.endSeconds` doit être strictement supérieur à `opts.startSeconds`, sinon `err("Plage de découpe invalide", "INVALID_TRIM_RANGE")`
- **Pas de normalisation loudness** (pas de filtre `loudnorm`) : les podcasts RSS sont déjà masterisés ; on ne traite que le format / la découpe
- Stratégie de sortie (par ordre de préférence, pour la latence) :
  1. **Source déjà `.mp3` + plage ≈ fichier entier** (`start ≈ 0`, `end ≈ durée probe`, tolérances `0.05s` / `0.2s`) → `copyFile` vers `outputPath` (aucun ffmpeg)
  2. **Source déjà `.mp3` + découpe réelle** → ffmpeg en **copie de flux** (`-c:a copy`) avec seek en entrée (`.seekInput(start)` + `.setDuration(durée)`) — coupe à la trame MP3 (~26 ms), largement suffisant pour un podcast
  3. **Autre format** (ex. `.m4a`) → ré-encodage `libmp3lame`, 44.1 kHz, 128 kbps, `-compression_level 0` (mode rapide)
- `ensureMp3` : garantit un MP3 prêt pour découpe rapide — copie si source déjà MP3, sinon ré-encodage **une seule fois** (utilisé à la préparation vers `processed/<episodeId>/source.mp3`)
- `onProgress` branché sur l'event `progress` de fluent-ffmpeg quand un encodage/copie de flux a lieu (pourcentage estimé à partir de `timemark` / durée cible)
- En cas d'échec ffmpeg (code retour non nul) → `err("Le traitement audio a échoué", "FFMPEG_ERROR")`, ne jamais laisser de fichier de sortie partiel (supprimer si présent)

### `src/lib/media/image.ts`

```typescript
export async function cropImageToSquare(opts: ImageCropOptions): Promise<Result<{ path: string; size: number }>>;
```

- `sharp(sourcePath).resize(size, size, { fit: "cover", position: opts.focusX/focusY fournis ? sharp.strategy custom via extract, sinon "centre" }).jpeg({ quality: 85 }).toFile(outputPath)`
- Si `focusX`/`focusY` sont fournis (recadrage manuel utilisateur, spec 04), calculer un `extract()` manuel avant le `resize` plutôt que d'utiliser `position` (qui ne supporte qu'un enum de positions prédéfinies) : extraire un carré centré sur `(focusX * width, focusY * height)` de côté `min(width, height)`, en le clampant pour rester dans les bornes de l'image
- Valide que le fichier source est une image lisible par sharp, sinon `err("Image illisible", "INVALID_IMAGE")`

### `src/lib/media/waveform.ts`

```typescript
export async function generateWaveformPeaks(inputPath: string, numPoints?: number /* défaut 200 */): Promise<Result<number[]>>;
```

- Utiliser `fluent-ffmpeg` pour extraire un flux audio brut mono basse résolution vers `stdout` :
  `ffmpeg -i <input> -f f32le -ac 1 -ar 3000 -` (peu coûteux, suffisant pour une waveform visuelle)
- Lire le buffer résultant comme un tableau de `Float32Array`, le découper en `numPoints` buckets égaux, calculer pour chaque bucket le pic d'amplitude absolue (`max(abs(sample))`), normaliser l'ensemble des buckets sur `[0, 1]` en divisant par le maximum global (si le maximum est 0, retourner un tableau de zéros plutôt qu'une division par zéro)
- Retourne un tableau de `numPoints` nombres flottants entre 0 et 1

## Suivi de progression (`src/lib/jobs/`)

### `src/lib/jobs/tracker.ts`

```typescript
export type JobStatus = "pending" | "running" | "done" | "error";

export interface JobState {
  id: string;
  status: JobStatus;
  progress: number;      // 0-100
  message?: string;       // pour affichage utilisateur (ex: "Téléchargement en cours…")
  errorCode?: string;
  createdAt: number;      // Date.now()
}

export function createJob(): string;                                  // retourne un id, initialise status "pending"
export function updateJob(id: string, patch: Partial<JobState>): void;
export function getJob(id: string): JobState | undefined;
export function cleanupOldJobs(maxAgeMs: number): void;                // à appeler périodiquement
```

- Stockage en mémoire (`Map<string, JobState>`) au niveau du module — acceptable pour un seul process Node mono-instance (cohérent avec le choix d'architecture sans DB/queue externe)

### `src/lib/jobs/semaphore.ts`

```typescript
export async function withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T>;
```

- Limite le nombre d'exécutions concurrentes de tâches lourdes (téléchargement + ffmpeg) à `env.MAX_CONCURRENT_JOBS`, via une file d'attente simple (tableau de résolveurs de Promise)
- Objectif : garde-fou anti-abus sur un déploiement public sans authentification (voir `requirements/03-contraintes-legales-et-risques.md`)

## Server Actions (`src/lib/actions/media.ts`)

```typescript
"use server";
export async function prepareEpisodeAction(sessionId: string, episode: EpisodeMeta): Promise<Result<{ jobId: string }>>;
export async function getJobStatusAction(jobId: string): Promise<Result<JobState>>;
export async function trimEpisodeAction(sessionId: string, episodeId: string, opts: TrimOptions): Promise<Result<{ storyPath: string; durationSeconds: number }>>;
export async function cropEpisodeCoverAction(sessionId: string, episodeId: string, focus?: { x: number; y: number }): Promise<Result<{ path: string }>>;
```

- `prepareEpisodeAction` : crée un job, lance en arrière-plan (sans bloquer la réponse) : vérifie `episode.durationSeconds` contre `env.MAX_EPISODE_DURATION_SECONDS` (sinon `err(..., "EPISODE_TOO_LONG")` immédiat sans créer de job) → télécharge audio → **`ensureMp3` vers `processed/<episodeId>/source.mp3`** (conversion unique si besoin) → image + vignette → waveform sur le MP3 → `updateJob` à chaque étape avec un `message` explicite → statut final `"done"` avec le chemin des fichiers dans `resultRef` (JSON stringifié, `audioPath`/`storyPath` = `source.mp3`, + `durationSeconds`) ou `"error"`
- **Le ré-encodage lourd (m4a→mp3) a lieu à la préparation**, pas à la validation : `story.mp3` est ensuite produit par `trimEpisodeAction` en copie de flux depuis `source.mp3` (quasi instantané)
- `trimEpisodeAction` : **synchrone** (attend la fin du traitement et renvoie directement `{ storyPath, durationSeconds }`, pas de `jobId` / polling). Préfère `processed/.../source.mp3` s'il existe, sinon retombe sur `source/.../audio.*`. Enveloppée dans `withConcurrencyLimit`. L'UI peut lancer plusieurs découpes en parallèle (`Promise.all`) ; le sémaphore borne la charge réelle
- `prepareEpisodeAction` : le tout est enveloppé dans `withConcurrencyLimit` ; l'UI lance aussi plusieurs préparations en parallèle pour une sélection multi-épisodes

## Tests

- Fixtures : committer un mp3 de test très court (~2s, silence ou bip généré une fois avec ffmpeg et versionné) et une petite image JPEG dans `src/lib/media/__fixtures__/`
- `trim.test.ts` : découpe la fixture sur une plage valide → vérifie que le fichier de sortie existe et a une durée proche de la plage demandée (tolérance ±0.2s) ; plage invalide → erreur `INVALID_TRIM_RANGE` ; plage couvrant tout un MP3 → copie (durée inchangée) ; `ensureMp3` sur la fixture MP3 → produit un MP3 de même durée
- `image.test.ts` : recadre la fixture → vérifie via `sharp(output).metadata()` que la sortie fait bien 320x320 et est un JPEG
- `waveform.test.ts` : génère 50 points sur la fixture → vérifie la longueur du tableau et que toutes les valeurs sont dans `[0, 1]`
- `download.test.ts` : mocker `fetch` pour simuler un `Content-Type` invalide → vérifie `INVALID_CONTENT_TYPE` ; simuler un flux dépassant `MAX_DOWNLOAD_MB` → vérifie `FILE_TOO_LARGE` et l'absence de fichier partiel résiduel
- `tracker.test.ts` : crée un job, met à jour son statut, vérifie `getJob` ; `cleanupOldJobs` supprime bien les jobs dépassant l'âge max
