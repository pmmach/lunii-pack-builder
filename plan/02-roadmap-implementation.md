# Roadmap d'implémentation

Chaque phase doit rester livrable et testable indépendamment. On ne démarre une phase que sur demande explicite (cf. règle "ne jamais en faire plus que demandé").

Depuis le cadrage, chaque phase ci-dessous est détaillée en spec d'implémentation prête à l'emploi dans [`specs/`](../specs/README.md), pensée pour être exécutée par un modèle moins coûteux avec un minimum d'ambiguïté. Correspondance phase ↔ spec :

| Phase | Spec |
|---|---|
| 1 | `specs/00-setup-projet.md` |
| 2 | `specs/01-resolution-source.md` |
| 3 | `specs/02-pipeline-media.md` + `specs/03-pack-builder-export.md` |
| 4 | `specs/04-ui-ux-parcours.md` (couvre l'édition audio visuelle et la gestion multi-histoires dans un seul parcours) |
| 5 | `specs/05-deploiement-coolify.md` |

## Phase 0 — Cadrage (fait)

- Analyse et remise en question du besoin
- Choix de stack (incluant la contrainte de déploiement Coolify/VPS, sans authentification en v1)
- Initialisation du dépôt : `requirements/`, `plan/`, `specs/`, règles Cursor

## Phase 1 — Squelette applicatif

- Initialisation du projet Next.js 15 (TypeScript strict, Tailwind, shadcn/ui, ESLint/Prettier)
- Mise en place Vitest + Zod
- Page d'accueil avec formulaire de saisie d'URL (sans logique métier encore)

## Phase 2 — Résolution de source (RSS)

- `lib/sources/rss.ts` + `lib/sources/generic-page.ts` : coller une URL France Inter/Radio France (ou tout flux RSS) → récupérer titre, image, liste d'épisodes
- `lib/sources/directory-resolver.ts` : coller une URL Spotify/Apple/Deezer → retrouver le flux RSS équivalent par nom d'émission, avec confirmation utilisateur
- Tests unitaires sur des flux/pages exemples

## Phase 3 — Pipeline média + pack simple (histoire unique)

- Téléchargement audio, trim ffmpeg, recadrage image sharp, génération de waveform, suivi de progression
- `lib/pack/builder.ts` + `zip.ts` : génération de l'arborescence + `md.yaml` + export `.zip`
- Test end-to-end manuel : import du zip généré dans Lunii Admin Web → vérifier que "create pack" fonctionne et que le pack s'installe sur l'appareil

## Phase 4 — Parcours UI complet (édition audio visuelle + multi-histoires)

- Intégration `wavesurfer.js` pour sélectionner visuellement le point de début/fin (remplace Audacity)
- Atelier de pack : ajouter plusieurs épisodes, réordonner (`@dnd-kit`), supprimer, générer un pack multi-histoires
- Design system dédié (couleurs, typographie, accessibilité, dark mode) — voir `specs/04-ui-ux-parcours.md`

## Phase 5 — Déploiement Coolify

- Dockerfile multi-stage, health check, variables d'environnement
- Garde-fous anti-abus (limitation de débit par IP, purge automatique du workspace) puisque l'outil est ouvert sans authentification
- Runbook de déploiement sur le VPS de l'utilisateur

## Phase 6 — Stretch goals (optionnel, à discuter)

- Génération directe du pack STUdio final (bypass de l'étape manuelle dans Lunii Admin Web)
- Normalisation de volume audio automatique
- Persistance légère (SQLite) pour retrouver ses packs entre sessions
