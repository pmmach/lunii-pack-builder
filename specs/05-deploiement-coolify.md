# Spec 05 — Déploiement Docker / Coolify

Contexte : `plan/00-stack-technique.md` (§ Impact du déploiement Coolify), `plan/01-architecture.md` (§ Topologie de déploiement), risques dans `requirements/03-contraintes-legales-et-risques.md` (outil ouvert sans authentification).

## Objectif

Rendre l'application déployable en un clic sur un VPS via Coolify (build Dockerfile), avec les mêmes garanties fonctionnelles qu'en local, plus les garde-fous anti-abus nécessaires à un outil public sans authentification.

## Dockerfile

Multi-stage, base **Debian slim** (pas Alpine — voir justification dans `plan/00-stack-technique.md`) :

```dockerfile
# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Requis pour Next standalone en conteneur (sinon écoute seulement localhost)
ENV HOSTNAME=0.0.0.0
# Coolify exécute les healthchecks HTTP via curl/wget dans l'image
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system app && useradd --system --gid app app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Binaires ffmpeg/ffprobe (optionalDeps) souvent absents du tracer standalone
COPY --from=builder /app/node_modules/@ffmpeg-installer ./node_modules/@ffmpeg-installer
COPY --from=builder /app/node_modules/@ffprobe-installer ./node_modules/@ffprobe-installer
RUN mkdir -p /app/workspace && chown -R app:app /app
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl --fail --silent --show-error http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
```

Points d'attention :

- `output: "standalone"` (déjà configuré en spec 00) est indispensable pour que `.next/standalone/server.js` existe
- `HOSTNAME=0.0.0.0` est indispensable : sans ça, Next standalone n'est joignable ni par Traefik ni par le healthcheck Coolify
- `curl` est installé dans l'image finale car Coolify exige curl/wget pour les healthchecks HTTP sur les déploiements Dockerfile
- `@ffmpeg-installer/ffmpeg`, `@ffprobe-installer/ffprobe` et `sharp` embarquent leurs binaires natifs dans `node_modules` lors du `npm ci`/`npm run build` : comme l'image finale est aussi Debian glibc (cohérente avec l'étape de build), aucune installation ffmpeg via `apt` n'est nécessaire
- Les binaires plateforme (`@ffmpeg-installer/linux-x64`, `@ffprobe-installer/linux-x64`, …) sont des **optionalDependencies** résolues dynamiquement : le tracer `standalone` de Next ne les copie pas toujours. D'où le `COPY` explicite dans le stage `runner` (et `outputFileTracingIncludes` dans `next.config.ts`) — sans ça → `Cannot find module '@ffprobe-installer/linux-x64/ffprobe'` au trim
- Le `HEALTHCHECK` interne est optionnel si Coolify fait déjà son propre health check HTTP (voir plus bas) — le garder ne coûte rien et aide au debug via `docker inspect`

## `.dockerignore`

```
node_modules
.next
.git
workspace
*.log
.env*
```

## Variables d'environnement (à définir dans l'UI Coolify, pas dans le repo)

| Variable | Défaut | Rôle |
|---|---|---|
| `MAX_DOWNLOAD_MB` | `100` | Taille max d'un fichier audio/image téléchargé |
| `MAX_EPISODE_DURATION_SECONDS` | `3600` | Durée max d'un épisode traité (anti-abus) |
| `MAX_CONCURRENT_JOBS` | `3` | Traitements ffmpeg/téléchargement simultanés max |
| `DOWNLOAD_TIMEOUT_MS` | `300000` | Timeout d'inactivité d'un téléchargement audio (ms) ; relancé à chaque chunk reçu |
| `WORKSPACE_TTL_MINUTES` | `30` | Délai avant purge d'une session terminée |
| `RATE_LIMIT_PER_MINUTE` | `10` | Requêtes max par IP/minute sur les actions lourdes (résolution, export, aperçu TTS) |
| `PODCASTINDEX_API_KEY` / `_SECRET` | (vide) | Optionnel, fallback si l'iTunes Search API ne suffit pas (spec 01) |
| `TTS_PROVIDER` | `edge` | Provider TTS : `edge` (sans clé) \| `azure` \| `google` (spec 07) |
| `TTS_LANGUAGE` | `fr-FR` | Locale TTS (v1 : français) |
| `TTS_VOICE` | `fr-FR-EloiseNeural` | Voix provider (enfant FR) |
| `TTS_TIMEOUT_MS` | `8000` | Timeout d'un appel TTS (ms) |
| `TTS_MAX_CONCURRENT` | `1` | Synthèses TTS simultanées max |
| `TTS_MAX_CHARS` | `200` | Longueur max du texte synthétisé |
| `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` | (vide) | Requis si `TTS_PROVIDER=azure` |
| `GOOGLE_TTS_API_KEY` | (vide) | Requis si `TTS_PROVIDER=google` |
| `STATS_TOKEN` | (vide) | Mot de passe de la page `/stats`. Vide = page en 404 |

Toutes ont des valeurs par défaut sûres dans `src/lib/shared/env.ts` (spec 00) — aucune n'est strictement obligatoire au démarrage. Avec le défaut `edge`, le mode intro « Synthétique » est disponible sans configuration. Azure/Google sans clés : option désactivée dans l'UI (spec 07). `STATS_TOKEN` vide laisse la page de statistiques invisible.

## Garde-fous anti-abus (obligatoires pour un déploiement public sans authentification)

### Limitation de débit par IP (`src/lib/shared/rate-limit.ts`)

```typescript
export function checkRateLimit(ip: string, bucket: "resolve" | "export" | "tts"): Result<true>;
```

- Implémentation en mémoire (token bucket ou fenêtre glissante simple, `Map<string, { count: number; resetAt: number }>`), clé = `ip + bucket`
- Limite : `env.RATE_LIMIT_PER_MINUTE` requêtes par minute et par IP, par bucket
- Dépassement → `err("Trop de requêtes, réessaie dans une minute.", "RATE_LIMITED")`
- Appelé en première ligne des Server Actions `resolveSourceAction`, `exportPackAction` (specs 01 et 03) et `synthesizeTitleAction` (spec 07) — récupérer l'IP via l'en-tête `x-forwarded-for` (Coolify/Traefik le fournit) avec fallback sur l'IP de connexion directe en dev local
- **Ne pas** présenter ceci comme une authentification : c'est un garde-fou technique, pas un contrôle d'accès (cf. `requirements/01-exigences-fonctionnelles.md`)

### Purge automatique de l'espace de travail (`src/lib/jobs/cleanup.ts`)

```typescript
export function startWorkspaceCleanupScheduler(): void;
```

- Appelé une fois au démarrage du serveur (ex: dans `instrumentation.ts` de Next.js, hook officiel pour du code d'initialisation côté serveur)
- Toutes les 5 minutes : parcourt `workspace/`, supprime tout dossier `<sessionId>` dont le fichier le plus récent date de plus de `env.WORKSPACE_TTL_MINUTES` minutes
- Journalise (console) le nombre de sessions nettoyées, sans détail sensible

## Statistiques d'usage

Historique léger pour la page `/stats` (protégée par `STATS_TOKEN`, 404 si la variable est vide). Pas de cookie visiteur, pas de service externe.

- Une ligne JSON par action dans `data/usage.jsonl` : date, type (`visit`, `resolve`, `export`, `download`, `tts`, `rate_limited`), succès, type de source, nombre d'histoires, code d'erreur, empreinte visiteur
- L'empreinte est un HMAC de l'IP (sel dans `data/visitor-salt`). L'IP, l'URL et les titres ne sont pas écrits
- Rétention 6 mois (fuseau Europe/Paris), purge à la lecture de `/stats` et périodiquement à l'écriture
- La page agrège aujourd'hui, 30 jours et 6 mois : visiteurs, fréquence, résolutions, packs générés, téléchargements, histoires, aperçus TTS, rate limits. Quatre courbes couvrent les 6 mois : visiteurs, résolutions réussies, packs générés, packs téléchargés
- Volume Coolify **persistant** monté sur `/app/data`. Sans ce volume, l'historique part à chaque redéploiement. Le dossier doit être accessible en écriture par l'utilisateur `app` du conteneur

## Runbook Coolify (à exécuter manuellement par l'utilisateur)

1. Dans Coolify : **New Resource → Application → Public/Private Git Repository**, pointer sur ce repo et la branche à déployer
2. Build Pack : **Dockerfile** (pas Nixpacks)
3. Port exposé : `3000`
4. Health check : chemin `/api/health`, port `3000`
5. Variables d'environnement : renseigner celles du tableau ci-dessus si on veut dévier des valeurs par défaut
6. Pas de volume persistant pour `workspace/` (éphémère, purgé automatiquement). Pour garder l'historique de `/stats`, ajouter un volume persistant monté sur `/app/data`
7. Domaine : attacher un sous-domaine dans Coolify, laisser Traefik gérer le certificat Let's Encrypt automatiquement
8. Déployer, vérifier `https://<domaine>/api/health` → `{"status":"ok"}`, puis tester un cycle complet (résoudre une source → générer un pack) directement sur le déploiement
9. Si `STATS_TOKEN` est défini : ouvrir `https://<domaine>/stats`, saisir le mot de passe, vérifier qu'une visite apparaît après un chargement de l'accueil

## Tests / critères d'acceptation

- [ ] `docker build -t lunii-pack-builder .` réussit en local
- [ ] `docker run -p 3000:3000 lunii-pack-builder` répond sur `/api/health`
- [ ] Un trim ffmpeg fonctionne à l'intérieur du conteneur (test manuel : lancer le parcours complet contre le conteneur local avant de déployer sur le VPS)
- [ ] `checkRateLimit` testé unitairement (`rate-limit.test.ts`) : autorise sous la limite, bloque au-delà, se réinitialise après la fenêtre de temps (mocker `Date.now`)
- [ ] `usage.test.ts` : agrège l'historique, déduplique les visites, purge au-delà de 6 mois, n'écrit pas l'IP
- [ ] Déploiement Coolify réel validé manuellement par l'utilisateur sur son VPS (hors périmètre de l'agent)
