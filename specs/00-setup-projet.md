# Spec 00 — Squelette du projet

## Objectif

Initialiser le projet Next.js 15 avec l'outillage complet, la structure de dossiers cible et les tokens de design de base, sans encore implémenter de logique métier.

## Étapes

### 1. Scaffold Next.js

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

- Répondre "No" à Turbopack en dev si demandé (on veut la config par défaut stable) — sinon garder les valeurs par défaut proposées.
- Vérifier que `tsconfig.json` a `"strict": true` ; ajouter également `"noUncheckedIndexedAccess": true`.

### 2. shadcn/ui

```bash
npx shadcn@latest init
```

- Style: "default", couleur de base: "slate" (sera surchargée par les tokens de la spec 04)
- Ajouter tout de suite les composants de base nécessaires dès cette spec :

```bash
npx shadcn@latest add button card input label form progress alert skeleton separator
```

### 3. Dépendances additionnelles

```bash
npm install zod uuid js-yaml archiver rss-parser cheerio @ffmpeg-installer/ffmpeg fluent-ffmpeg sharp wavesurfer.js @dnd-kit/core @dnd-kit/sortable lucide-react
npm install -D vitest @vitejs/plugin-react yauzl @types/uuid @types/js-yaml @types/archiver @types/fluent-ffmpeg @types/yauzl
```

### 4. Structure de dossiers à créer

```
src/
  app/
    api/
      health/route.ts
  lib/
    shared/
      result.ts
      env.ts
      slugify.ts
      slugify.test.ts
    sources/        (vide, README.md pointant vers specs/01)
    media/          (vide, README.md pointant vers specs/02)
    pack/           (vide, README.md pointant vers specs/03)
    jobs/           (vide, README.md pointant vers specs/02)
```

### 5. `src/lib/shared/result.ts`

Implémenter exactement le type `Result<T>` décrit dans `specs/README.md` (section "Gestion des erreurs").

### 6. `src/lib/shared/env.ts`

Valider les variables d'environnement avec Zod au chargement du module (fail-fast si une valeur est invalide, mais toutes optionnelles avec valeurs par défaut sûres pour ne pas bloquer le dev local) :

```typescript
import { z } from "zod";

const envSchema = z.object({
  MAX_DOWNLOAD_MB: z.coerce.number().positive().default(100),
  MAX_EPISODE_DURATION_SECONDS: z.coerce.number().positive().default(3600),
  MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().default(2),
  DOWNLOAD_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  WORKSPACE_TTL_MINUTES: z.coerce.number().positive().default(30),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().positive().default(10),
  PODCASTINDEX_API_KEY: z.string().optional(),
  PODCASTINDEX_API_SECRET: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

Créer aussi `.env.example` documentant chacune de ces variables avec un commentaire d'une ligne.

### 7. `src/lib/shared/slugify.ts`

```typescript
export function slugify(input: string): string;
```

- Translittère les accents (ex: "Émission" → "emission"), passe en minuscule, remplace tout ce qui n'est pas `[a-z0-9]` par `-`, réduit les tirets consécutifs, trim les tirets en début/fin
- Si le résultat est vide, retourner `"histoire"` (fallback)
- Écrire `slugify.test.ts` avec au moins : accents, espaces multiples, caractères spéciaux, chaîne vide

### 8. Route de santé

`src/app/api/health/route.ts` :

```typescript
export async function GET() {
  return Response.json({ status: "ok" });
}
```

### 9. Page d'accueil (placeholder)

Un simple composant avec le `<Card>` shadcn affichant le titre du projet et un `<Input>` + `<Button>` désactivé (pas de logique — juste pour valider que le style fonctionne). L'implémentation réelle du parcours est dans la spec 04.

### 10. Config Next.js

Dans `next.config.ts`, ajouter dès maintenant (nécessaire pour le déploiement Docker de la spec 05) :

```typescript
const nextConfig = {
  output: "standalone",
};
```

### 11. `next.config.ts` — expérimental serverActions bodySizeLimit

Les Server Actions de la spec 02/03 ne manipulent que des chemins/métadonnées (pas d'upload direct de gros fichiers via Server Action), donc pas de configuration spéciale nécessaire à ce stade — à revisiter si la spec 04 introduit un upload d'image custom par l'utilisateur.

## Critères d'acceptation

- [ ] `npm run dev` démarre sans erreur, page d'accueil visible avec les composants shadcn stylés
- [ ] `npm run build` réussit (mode `output: "standalone"`)
- [ ] `npm run lint` ne remonte aucune erreur
- [ ] `npm run test` (à ajouter comme script `vitest run`) passe, avec le test de `slugify.ts` au vert
- [ ] `GET /api/health` répond `200 { "status": "ok" }`
- [ ] `.env.example` présent et documenté, `.env*` bien ignorés par git (déjà couvert par `.gitignore` existant)
