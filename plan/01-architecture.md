# Architecture (proposition)

## Vue d'ensemble

```
Utilisateur
    │  colle une URL de podcast (épisode ou émission)
    ▼
[UI Next.js] ── Server Action: resolveSource(url) ──▶ [lib/sources/*]
    │                                                     │ détecte RSS / résout Spotify → RSS
    │◀──────────── liste d'épisodes + métadonnées ────────┘
    │
    │  sélection épisode(s) + réglages trim/image/titres
    ▼
[UI Next.js] ── Server Action: buildStory(episode, edits) ──▶ [lib/media/*]
    │                                                            │ download → trim (ffmpeg) → crop (sharp)
    │◀───────────────── aperçu histoire prête ───────────────────┘
    │
    │  (répéter pour plusieurs histoires si pack multi)
    ▼
[UI Next.js] ── Server Action: exportPack(pack) ──▶ [lib/pack/*]
    │                                                   │ story.json + assets/ (STUdio) → zip
    │◀───────────────── fichier .zip téléchargeable ────┘
    ▼
Utilisateur importe le .zip dans Lunii Admin Builder / Web → installe sur l'appareil (USB)
```

## Modules applicatifs

- **`app/`** (routes Next.js, App Router)
  - `app/page.tsx` : saisie de l'URL de départ
  - `app/pack/[sessionId]/page.tsx` : atelier de construction du pack (liste des histoires, édition, aperçu)
  - `app/api/download/[sessionId]/route.ts` : endpoint de téléchargement du zip final

- **`lib/sources/`** — un adapter par type de source, interface commune :
  ```ts
  interface SourceAdapter {
    canHandle(url: string): boolean;
    resolve(url: string): Promise<{ type: "episode" | "show"; episodes: EpisodeMeta[] }>;
  }
  ```
  - `rss.ts` : lecture directe d'un flux RSS
  - `generic-page.ts` : découverte du flux RSS depuis une page HTML (link tag / JSON-LD), utilisé pour radiofrance.fr et autres pages de podcast génériques
  - `spotify-resolver.ts` (et équivalents Apple/Deezer) : n'extrait **aucun audio** — résout uniquement le nom de l'émission vers son flux RSS public via l'API iTunes Search / PodcastIndex

- **`lib/media/`**
  - `download.ts` : téléchargement de l'audio source vers le workspace de session
  - `trim.ts` : découpe audio (copie fichier / copie de flux MP3 / ré-encodage lame si besoin) — pas de normalisation loudness
  - `image.ts` : recadrage/redimensionnement sharp vers 320x320 JPEG
  - `waveform.ts` : génération des données de waveform pour l'éditeur visuel côté client

- **`lib/pack/`**
  - `types.ts` / `model.ts` : `PackDraft`, `StoryDraft` (titre, auteur, uuid, chemins des assets)
  - `studio-format.ts` : construction du graphe STUdio (`story.json`) + plan de copie des assets ; fin de lecture = retour menu (`okTransition` = `homeTransition`)
  - `write-to-disk.ts` : écrit `assets/` + `story.json`, génère l'intro 8s par défaut si besoin
  - `zip.ts` : compresse le contenu à la **racine** du `.zip` via `archiver` (pas de dossier packSlug wrapper)

- **`lib/jobs/`**
  - Tracker de progression en mémoire pour la **préparation** (téléchargement / waveform), exposé à l'UI via polling ; la **découpe** est synchrone (Server Action)

## Stockage de session

- `workspace/<sessionId>/source/` : audio brut téléchargé, métadonnées récupérées
- `workspace/<sessionId>/pack/<slug>/` : `story.json` + `assets/` prêts à zipper
- Nettoyage automatique après téléchargement du zip (TTL) ou purge périodique

## Topologie de déploiement

```
                     ┌────────────────────────────┐
  Local (dev)        │   npm run dev (Node 20)     │
                     └────────────────────────────┘

                     ┌────────────────────────────────────────────┐
  VPS via Coolify    │ Conteneur Docker (node:20-bookworm-slim)    │
                     │  - Next.js standalone (port 3000)            │
                     │  - ffmpeg (@ffmpeg-installer/ffmpeg)          │
                     │  - workspace/ éphémère (purge TTL en tâche    │
                     │    de fond)                                   │
                     │  - GET /api/health → 200 (probe Coolify)      │
                     └────────────────────────────────────────────┘
                                    ▲
                                    │ HTTPS (reverse proxy Coolify/Traefik)
                                    │
                               Navigateur
```

- Même image de code entre local et VPS ; seule la commande de démarrage change (`next dev` vs `next start` via le serveur standalone buildé)
- Pas de service externe additionnel (DB, cache, queue) à ce stade
- Détails complets (Dockerfile, variables d'env, garde-fous anti-abus) : `specs/05-deploiement-coolify.md`

## Points d'extension prévus (v2+)

- Persistance légère (SQLite) si on veut retrouver ses packs entre deux sessions
- Normalisation de volume audio (volontairement absente en v1)
- Écriture directe sur l'appareil (hors scope serveur ; nécessiterait un outil desktop / WebUSB côté client)
