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
RUN groupadd --system app && useradd --system --gid app app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
RUN mkdir -p /app/workspace && chown -R app:app /app
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
```

Points d'attention :

- `output: "standalone"` (déjà configuré en spec 00) est indispensable pour que `.next/standalone/server.js` existe
- `@ffmpeg-installer/ffmpeg` et `sharp` embarquent leurs binaires natifs dans `node_modules` lors du `npm ci`/`npm run build` : comme l'image finale est aussi Debian glibc (cohérente avec l'étape de build), aucune installation `apt` supplémentaire n'est nécessaire
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
| `MAX_CONCURRENT_JOBS` | `2` | Traitements ffmpeg/téléchargement simultanés max |
| `DOWNLOAD_TIMEOUT_MS` | `300000` | Timeout d'inactivité d'un téléchargement audio (ms) ; relancé à chaque chunk reçu |
| `WORKSPACE_TTL_MINUTES` | `30` | Délai avant purge d'une session terminée |
| `RATE_LIMIT_PER_MINUTE` | `10` | Requêtes max par IP/minute sur les actions lourdes (résolution, export) |
| `PODCASTINDEX_API_KEY` / `_SECRET` | (vide) | Optionnel, fallback si l'iTunes Search API ne suffit pas (spec 01) |

Toutes ont des valeurs par défaut sûres dans `src/lib/shared/env.ts` (spec 00) — aucune n'est strictement obligatoire au démarrage.

## Garde-fous anti-abus (obligatoires pour un déploiement public sans authentification)

### Limitation de débit par IP (`src/lib/shared/rate-limit.ts`)

```typescript
export function checkRateLimit(ip: string, bucket: "resolve" | "export"): Result<true>;
```

- Implémentation en mémoire (token bucket ou fenêtre glissante simple, `Map<string, { count: number; resetAt: number }>`), clé = `ip + bucket`
- Limite : `env.RATE_LIMIT_PER_MINUTE` requêtes par minute et par IP, par bucket
- Dépassement → `err("Trop de requêtes, réessaie dans une minute.", "RATE_LIMITED")`
- Appelé en première ligne des Server Actions `resolveSourceAction` et `exportPackAction` (specs 01 et 03) — récupérer l'IP via l'en-tête `x-forwarded-for` (Coolify/Traefik le fournit) avec fallback sur l'IP de connexion directe en dev local
- **Ne pas** présenter ceci comme une authentification : c'est un garde-fou technique, pas un contrôle d'accès (cf. `requirements/01-exigences-fonctionnelles.md`)

### Purge automatique de l'espace de travail (`src/lib/jobs/cleanup.ts`)

```typescript
export function startWorkspaceCleanupScheduler(): void;
```

- Appelé une fois au démarrage du serveur (ex: dans `instrumentation.ts` de Next.js, hook officiel pour du code d'initialisation côté serveur)
- Toutes les 5 minutes : parcourt `workspace/`, supprime tout dossier `<sessionId>` dont le fichier le plus récent date de plus de `env.WORKSPACE_TTL_MINUTES` minutes
- Journalise (console) le nombre de sessions nettoyées, sans détail sensible

## Runbook Coolify (à exécuter manuellement par l'utilisateur)

1. Dans Coolify : **New Resource → Application → Public/Private Git Repository**, pointer sur ce repo et la branche à déployer
2. Build Pack : **Dockerfile** (pas Nixpacks)
3. Port exposé : `3000`
4. Health check : chemin `/api/health`, port `3000`
5. Variables d'environnement : renseigner celles du tableau ci-dessus si on veut dévier des valeurs par défaut
6. Pas de volume persistant à attacher pour le MVP (le `workspace/` est éphémère et purgé automatiquement — voir plus haut) ; l'ajouter plus tard uniquement si un besoin de debug post-mortem apparaît
7. Domaine : attacher un sous-domaine dans Coolify, laisser Traefik gérer le certificat Let's Encrypt automatiquement
8. Déployer, vérifier `https://<domaine>/api/health` → `{"status":"ok"}`, puis tester un cycle complet (résoudre une source → générer un pack) directement sur le déploiement

## Tests / critères d'acceptation

- [ ] `docker build -t lunii-pack-builder .` réussit en local
- [ ] `docker run -p 3000:3000 lunii-pack-builder` répond sur `/api/health`
- [ ] Un trim ffmpeg fonctionne à l'intérieur du conteneur (test manuel : lancer le parcours complet contre le conteneur local avant de déployer sur le VPS)
- [ ] `checkRateLimit` testé unitairement (`rate-limit.test.ts`) : autorise sous la limite, bloque au-delà, se réinitialise après la fenêtre de temps (mocker `Date.now`)
- [ ] Déploiement Coolify réel validé manuellement par l'utilisateur sur son VPS (hors périmètre de l'agent)
