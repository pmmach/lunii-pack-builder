# Stack technique proposée

## Critères de choix

- **Simple et efficace** : un seul projet, un seul serveur à lancer, pas d'infra externe (pas de DB serveur, pas de queue externe) pour un usage mono-utilisateur local
- Cohérent avec les préférences techniques par défaut : **Next.js 15 (App Router) + TypeScript strict**, **Tailwind CSS + shadcn/ui**
- Doit gérer des traitements "lourds" côté serveur (téléchargement de fichiers, ffmpeg, génération de zip) → nécessite un runtime **Node.js classique** (pas de déploiement edge/serverless pur)
- **Doit tourner à l'identique en local (`npm run dev`) et sur un VPS via Coolify** (build Docker), sans double stack ni service supplémentaire à opérer

## Impact du déploiement Coolify sur la stack

Coolify build/déploie des applications via **Docker** (Dockerfile) ou Nixpacks. On retient un **Dockerfile explicite** plutôt que Nixpacks pour ce projet, car on a une dépendance binaire (ffmpeg) à maîtriser précisément. Conséquences sur les choix techniques :

- **Runtime Node standard obligatoire** (déjà le cas) : Next.js est buildé en mode `output: "standalone"` pour une image Docker légère
- **Image de base Debian, pas Alpine** (`node:20-bookworm-slim`) : le paquet `@ffmpeg-installer/ffmpeg` fournit un binaire ffmpeg précompilé **glibc**, incompatible avec musl (Alpine). Utiliser Debian slim évite d'avoir à gérer une installation ffmpeg différente entre dev (Windows/Mac) et prod (Linux Docker)
- **Pas de base de données ni de queue externe à provisionner sur le VPS** : le choix "tout en mémoire + filesystem" (déjà retenu pour la simplicité) évite d'ajouter un service Coolify supplémentaire (Postgres/Redis) pour la v1
- **Pas de volume persistant requis pour le MVP** : chaque session de travail (`workspace/<sessionId>/`) est éphémère et nettoyée après export ; elle peut vivre dans le filesystem du conteneur. Une purge automatique (TTL) évite l'accumulation de sessions abandonnées entre deux redéploiements
- **Endpoint de health check** (`/api/health`) requis pour la supervision Coolify
- **Configuration via variables d'environnement Coolify** (pas de fichier `.env` committé) : clé API PodcastIndex optionnelle, limites d'abus (durée max, nombre de jobs concurrents)

Détail complet du Dockerfile et de la configuration Coolify : `specs/05-deploiement-coolify.md`.

> Note sur les règles génériques du profil : la règle "toute donnée doit provenir du SDK Directus" ne s'applique pas ici — ce projet n'a pas de backend de contenu (CMS). Les données manipulées sont des flux RSS externes et des fichiers média locaux, pas du contenu géré via Directus. Les autres préférences (Next.js/TS strict, Tailwind, shadcn/ui, RSC) sont conservées.

## Stack retenue

### Application

- **Next.js 15** (App Router, TypeScript strict) — un seul projet full-stack
- **React Server Components** pour l'affichage (liste d'épisodes, aperçu de pack, etc.)
- **Server Actions** (plutôt que Directus/API externe) pour les opérations : résoudre une URL, lister les épisodes, télécharger/trim l'audio, générer le pack. Justifié ici car ce sont des opérations locales orchestrant filesystem + ffmpeg, pas un CRUD sur un CMS
- **Tailwind CSS + shadcn/ui** pour l'interface (formulaire d'URL, sélection d'épisodes, éditeur de trim, aperçu de pack)
- Composants image via `next/image` en local (pas d'API Directus ici ; sert les images issues du pipeline de traitement)

### Traitement des sources podcast

- `rss-parser` : parsing des flux RSS/Atom
- `cheerio` : extraction de balises `<link rel="alternate">`, OG tags, JSON-LD sur une page de podcast quand le flux n'est pas donné directement
- Recherche de flux RSS à partir d'un nom d'émission (cas Spotify/Apple/Deezer) : API **iTunes Search** (gratuite, sans clé) en priorité, avec **PodcastIndex API** en fallback si besoin d'une clé plus tard

### Traitement média

- **ffmpeg** via `@ffmpeg-installer/ffmpeg` + `fluent-ffmpeg` : trim audio (copie de flux MP3 ou conversion lame si besoin), génération de waveform — **pas** de normalisation loudness
- **wavesurfer.js** (côté client) : affichage de la forme d'onde et sélection visuelle du point de début/fin avant trim serveur
- **sharp** : recadrage/redimensionnement des images de couverture vers le format cible (320x320 JPEG)
- **archiver** : génération du `.zip` STUdio final (`story.json` + `assets/` à la racine)
- **uuid** : génération des UUID v4 du pack et des nœuds du graphe
- **@dnd-kit/core** + **@dnd-kit/sortable** : réordonnancement des histoires dans un pack multi-histoires
- **next-themes** + **lucide-react** : thème clair/sombre et icônes de l'interface

> Note : `js-yaml` n'est plus requis pour l'export (plus de `md.yaml` ; métadonnées dans `story.json`).

### Stockage

- Pas de base de données pour le MVP : un **répertoire de travail par session** sur le système de fichiers (`workspace/<session-id>/...`), nettoyé après export ou via une purge automatique par ancienneté (nécessaire surtout sur le déploiement VPS longue durée, voir `specs/05-deploiement-coolify.md`)
- Si un besoin d'historique/persistance apparaît plus tard (v2+), envisager **SQLite** (`better-sqlite3` ou Prisma + SQLite) — volontairement non retenu en v1 pour rester simple

### Qualité / outillage

- **TypeScript strict**, ESLint (config Next.js), Prettier
- **Vitest** pour les tests unitaires (parsers de sources, générateur de pack, utilitaires média)
- **Zod** pour la validation des entrées (URL utilisateur, formulaires)

### Exécution

- `Node.js 20+` en local (`npm run dev`)
- **Dockerfile** (voir `specs/05-deploiement-coolify.md`), requis dès que l'on veut déployer sur le VPS via Coolify — pour éviter toute installation manuelle (remplace l'actuel besoin de JDK + Studio Lunii + Audacity), utilisable aussi en local via `docker build`/`docker run` si besoin

## Alternatives considérées et écartées

| Alternative | Raison de l'écarter |
|---|---|
| Backend séparé (Python/FastAPI) pour ffmpeg | Duplication inutile de stack ; Node gère très bien ffmpeg via bindings, un seul langage/projet est plus simple à maintenir |
| Base de données (Postgres, Directus, etc.) | Pas de besoin multi-utilisateur ni de contenu structuré à gérer en v1 ; complexité non justifiée |
| File d'attente externe (Redis/BullMQ) | Un seul utilisateur, une tâche à la fois suffit ; un tracker de job en mémoire dans le process Node suffit pour le MVP |
| Génération directe du pack STUdio final (story.json binaire) | Réinvente un format déjà bien géré par Lunii Admin Web ; complexité et risque de rupture non justifiés pour le MVP (voir roadmap pour v2 éventuelle) |
