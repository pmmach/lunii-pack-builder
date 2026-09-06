# Specs d'implémentation

Ce dossier contient des spécifications **prêtes à implémenter**, une par brique technique, pensées pour être exécutées par un modèle moins coûteux ("auto") avec un minimum d'ambiguïté et d'aller-retours.

Pour le contexte produit (besoin, périmètre, contraintes légales) voir `requirements/`. Pour les choix d'architecture/stack voir `plan/`. Ces specs traduisent ces décisions en tâches concrètes : fichiers à créer, signatures de fonctions, types, cas limites, critères d'acceptation.

## Ordre d'implémentation recommandé

| # | Spec | Dépend de | Contenu |
|---|------|-----------|---------|
| 00 | [`00-setup-projet.md`](./00-setup-projet.md) | — | Squelette Next.js 15, tooling, structure de dossiers |
| 01 | [`01-resolution-source.md`](./01-resolution-source.md) | 00 | Résolution d'une URL de podcast en liste d'épisodes |
| 02 | [`02-pipeline-media.md`](./02-pipeline-media.md) | 00 | Téléchargement, trim audio, recadrage image, waveform |
| 03 | [`03-pack-builder-export.md`](./03-pack-builder-export.md) | 00, 02 | Graphe STUdio (`story.json` + `assets/`) et export `.zip` |
| 04 | [`04-ui-ux-parcours.md`](./04-ui-ux-parcours.md) | 00–03 (au moins en types/stubs) | Interface du parcours complet |
| 05 | [`05-deploiement-coolify.md`](./05-deploiement-coolify.md) | 00–04 | Dockerfile, variables d'env, garde-fous anti-abus, runbook Coolify |

Chaque spec est conçue pour être livrée et validée indépendamment (une session d'implémentation = une spec = idéalement une PR). Ne pas anticiper le contenu d'une spec suivante pendant l'implémentation d'une spec en cours.

## Conventions transverses (valables pour toutes les specs)

### Gestion des erreurs — type `Result<T>`

Toutes les fonctions serveur pouvant échouer (I/O, réseau, parsing) retournent ce type plutôt que de lever une exception, pour forcer une gestion explicite côté appelant/UI :

```typescript
// src/lib/shared/result.ts
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err(error: string, code?: string): Result<never> {
  return { ok: false, error, code };
}
```

- `error` : message **destiné à être affiché à l'utilisateur** (français, clair, pas de stack trace)
- `code` : identifiant machine optionnel (ex: `"INVALID_URL"`, `"NO_FEED_FOUND"`) utilisable pour de la logique conditionnelle côté UI

### Emplacement du code

- `src/lib/shared/` : `result.ts`, `env.ts` (accès typé/validé aux variables d'environnement via Zod), `slugify.ts`
- `src/lib/sources/` : résolution de source (spec 01)
- `src/lib/media/` : traitement audio/image (spec 02)
- `src/lib/pack/` : modèle de pack, assemblage, zip (spec 03)
- `src/lib/jobs/` : suivi de progression des tâches longues (spec 02)
- `src/app/` : routes Next.js (pages + route handlers), Server Actions colocalisées ou dans `src/lib/actions/`

### Tests

- **Vitest**, fichiers `*.test.ts` colocalisés à côté du code testé
- Chaque spec liste ses critères d'acceptation sous forme de tests à écrire ; ils font partie de la définition de "terminé"
- Utiliser des fixtures minimales (petits fichiers audio/image/XML) commitées dans `__fixtures__/` à côté des tests, jamais de téléchargement réseau réel dans les tests unitaires (mocker `fetch`)

### Sécurité (rappel — voir aussi `.cursor/rules/020-security-privacy.mdc`)

- Toute URL fournie par l'utilisateur passe par la validation Zod + le garde-fou anti-SSRF avant tout `fetch`
- Tout nom dérivé d'une source externe (titre d'épisode, nom d'émission) passe par `slugify()` avant utilisation comme nom de fichier/dossier
- Pas de secrets en dur ; tout passe par `src/lib/shared/env.ts`
