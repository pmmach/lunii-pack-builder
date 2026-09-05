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
    │                                                   │ arborescence lunii-admin + md.yaml → zip
    │◀───────────────── fichier .zip téléchargeable ────┘
    ▼
Utilisateur importe le .zip dans Lunii Admin Web ("create pack" → installe sur l'appareil)
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
  - `trim.ts` : découpe ffmpeg (point début/fin) + normalisation de sortie mp3
  - `image.ts` : recadrage/redimensionnement sharp vers 320x320 JPEG
  - `waveform.ts` : génération des données de waveform pour l'éditeur visuel côté client

- **`lib/pack/`**
  - `model.ts` : types `Pack`, `Story` (titre, uuid, chemins des assets)
  - `builder.ts` : assemble l'arborescence de dossiers `pack-name/.../title.mp3, cover.jpeg, story.mp3` + `md.yaml`
  - `zipper.ts` : compresse le dossier en `.zip` via `archiver`

- **`lib/jobs/`**
  - Tracker de progression en mémoire (téléchargement/conversion peuvent prendre du temps) exposé à l'UI via polling ou stream

## Stockage de session

- `workspace/<sessionId>/source/` : audio brut téléchargé, métadonnées récupérées
- `workspace/<sessionId>/pack/` : arborescence finale prête à zipper
- Nettoyage automatique après téléchargement du zip (ou bouton "nettoyer" explicite)

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

- `lib/pack/studio-format.ts` : génération directe du pack STUdio final (`story.json` + assets), pour bypasser l'étape manuelle dans Lunii Admin Web
- Persistance légère (SQLite) si on veut retrouver ses packs entre deux sessions
