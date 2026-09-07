# Spec 06 — Édition de l'image du pack (étape "Pack")

Généré avec l'aide du skill `ui-ux-pro-max` (guidelines UX : états de sélection visibles, feedback de chargement, optimisation image) et `ui-styling` (shadcn/ui). Complète la spec 04 (étape 4 du parcours, badge "3. Pack" dans l'UI) et s'appuie sur les specs 02 (pipeline média) et 03 (assemblage du pack).

## Constat

À l'étape "Composition du pack" (`src/app/pack/[sessionId]/page.tsx`, `step === 4`), l'image du pack (`PackDraft.coverImagePath`) est actuellement **calculée automatiquement et invisible pour l'utilisateur** : `addStoryToPack` la fixe sur la vignette de la première histoire ajoutée, sans aucun contrôle UI. Il manque la possibilité de :

1. **Voir** quelle image sera utilisée par défaut (celle fournie par l'app — vignette de la 1ère histoire du pack).
2. **Importer** sa propre image.
3. **Choisir** l'image d'une des histoires du pack (pas forcément la première) comme image du pack.

Rappel important sur le format cible (`src/lib/pack/studio-format.ts`) : pour un pack à **une seule histoire**, le nœud `cover` du graphe STUdio reprend aujourd'hui *toujours* `story.coverImagePath`, en ignorant `pack.coverImagePath`. Pour que le choix utilisateur ait un effet identique quel que soit le nombre d'histoires, cette spec inclut une petite adaptation de cette fonction (voir plus bas) plutôt que de masquer le contrôle en mode 1 histoire.

## Principe UX

Pattern "identité éditable" (image + métadonnées), cohérent avec le reste de l'étape 4 : une carte compacte en haut de l'étape, un bouton d'action ouvrant une boîte de dialogue de sélection avec deux voies claires (galerie interne vs import), sélection à application immédiate (pas de double confirmation), état de sélection toujours visible par plus qu'une couleur (icône + libellé), et un retour arrière explicite ("Réinitialiser").

## Modèle de données

### `src/lib/session/client-store.ts` (ajout)

```typescript
export type PackCoverSource =
  | { type: "auto" }
  | { type: "story"; storyId: string }
  | { type: "upload"; path: string; url: string };
```

- `SessionState.packCover: PackCoverSource` — nouveau champ, défaut `{ type: "auto" }`
- `loadSession` : `packCover: parsed.packCover ?? { type: "auto" }` (même pattern de migration douce que `defaultTitleClipSeconds`, pour ne pas casser une session déjà en cours créée avant ce changement)

### `src/lib/pack/cover.ts` (nouveau fichier)

```typescript
export interface PackCoverResolution {
  path: string;
  /** Source effectivement utilisée : peut différer de l'entrée si l'histoire épinglée a été retirée du pack. */
  effectiveSource: PackCoverSource;
}

export function resolvePackCoverImagePath(
  cover: PackCoverSource,
  stories: { id: string; coverImagePath: string }[] // dans l'ordre courant du pack
): PackCoverResolution;
```

- `{ type: "auto" }` → `stories[0].coverImagePath` (comportement actuel, dynamique : suit le réordonnancement)
- `{ type: "story", storyId }` → cherche `storyId` dans `stories` ; si trouvé, retourne son `coverImagePath` avec `effectiveSource` inchangé ; **si introuvable** (histoire retirée du pack), retombe sur le comportement `auto` et retourne `effectiveSource: { type: "auto" }` pour que l'appelant détecte le fallback et prévienne l'utilisateur
- `{ type: "upload", path }` → retourne `path` tel quel, `effectiveSource` inchangé
- Cas défensif `stories.length === 0` : retourne `{ path: "", effectiveSource: { type: "auto" } }` (ne devrait jamais être atteint en pratique, `validatePackDraftClient`/`validatePackDraft` interdisant déjà l'export sans histoire)
- Fonction pure, aucun accès disque ni réseau

## Serveur — import d'une image personnalisée

### Espace de travail (complète la spec 02)

```
workspace/<sessionId>/
  pack-cover/
    upload.jpg    # image importée par l'utilisateur, déjà recadrée en carré 320x320
```

Dossier séparé de `workspace/<sessionId>/pack/` (réservé à l'assemblage final du pack, spec 03) pour éviter toute collision. Un seul fichier, réécrit à chaque nouvel import (pas d'accumulation, conforme à la règle de nettoyage).

### `src/lib/shared/env.ts` (ajout)

```typescript
MAX_COVER_UPLOAD_MB: z.coerce.number().positive().default(10),
```

### `src/lib/actions/media.ts` (ajout)

```typescript
"use server";
export async function uploadPackCoverAction(
  sessionId: string,
  formData: FormData // champ "file"
): Promise<Result<{ path: string; url: string }>>;
```

- Lit `formData.get("file")`, vérifie que c'est bien un `File`
- Types acceptés : `image/jpeg`, `image/png`, `image/webp` uniquement (pas de SVG — évite tout risque de parsing XML côté serveur) → sinon `err("Le fichier doit être une image JPEG, PNG ou WebP.", "INVALID_IMAGE_TYPE")`
- Taille max : `env.MAX_COVER_UPLOAD_MB` Mo → sinon `err("Image trop volumineuse (max <N> Mo).", "FILE_TOO_LARGE")`
- Écrit le fichier brut dans `workspace/<sessionId>/pack-cover/upload-src.<ext>` (extension déduite du MIME), puis appelle `cropImageToSquare({ sourcePath, outputPath: .../pack-cover/upload.jpg })` (spec 02, recadrage centré automatique — pas de recadrage manuel dans le périmètre de cette spec)
- Image illisible/corrompue → propage l'erreur `INVALID_IMAGE` de `cropImageToSquare` telle quelle
- Supprime `upload-src.<ext>` dans un `finally` après le recadrage (succès ou échec)
- Enveloppé dans `withConcurrencyLimit` (même sémaphore que le reste du pipeline média, garde-fou anti-abus déjà en place pour un déploiement public sans authentification)
- Retourne `{ path: <chemin absolu upload.jpg>, url: "/api/workspace/<sessionId>/pack-cover/upload.jpg?v=<Date.now()>" }` — le paramètre `v` sert de cache-buster (nom de fichier fixe réutilisé à chaque import)

Aucune autre Server Action n'est nécessaire pour le choix d'une image d'histoire existante : c'est un changement d'état 100 % client (`packCover = { type: "story", storyId }`), l'histoire étant déjà chargée dans `SessionState.stories`.

## Adaptation de `src/lib/pack/studio-format.ts`

Dans la branche **1 histoire** de `buildStudioPack`, remplacer l'usage systématique de `story.coverImagePath` pour le nœud `cover` par `pack.coverImagePath || story.coverImagePath` (fallback conservé pour compatibilité ascendante — `addStoryToPack` continue de préremplir `pack.coverImagePath` avec la vignette de l'histoire par défaut, donc le comportement existant est inchangé tant qu'aucune image n'a été choisie explicitement) :

```typescript
image: registerAsset(pack.coverImagePath || story.coverImagePath),
```

Aucun autre changement au graphe (la branche multi-histoires utilise déjà `pack.coverImagePath`). L'intro (`titleAudioPath`) du nœud `cover` en mode 1 histoire n'est pas concernée par cette spec.

## UI — étape 4 (`src/app/pack/[sessionId]/page.tsx`)

Nouveau composant `src/components/pack-cover-editor.tsx` (client), inséré **en haut de l'étape 4**, avant les champs Titre/Auteur/Description.

### Carte "Image du pack"

```
┌───────────────────────────────────────────────────────┐
│ ┌──────────┐  Image du pack                             │
│ │  aperçu  │  [Badge: Automatique | Personnalisée]       │
│ │  96×96   │  Texte d'aide contextuel (voir ci-dessous)  │
│ └──────────┘  [Changer l'image]  [Réinitialiser]*        │
└───────────────────────────────────────────────────────┘
* affiché uniquement si packCover.type !== "auto"
```

- Aperçu carré (`96x96`, `rounded-lg`, `object-cover`) recalculé via `resolvePackCoverImagePath(state.packCover, state.stories)` à chaque rendu (donc réactif à un réordonnancement en mode "Automatique")
  - Source de l'`<img>` : si résolution `auto` ou `story` → `episode.imageUrl` de l'histoire concernée (cohérent avec les vignettes déjà affichées dans la liste ordonnable de cette même étape) ; si résolution `upload` → l'`url` retournée par `uploadPackCoverAction`
- Badge : `secondary` "Automatique" tant que `effectiveSource.type === "auto"`, `default`/accent "Personnalisée" sinon
- Texte d'aide (une ligne, `text-muted-foreground text-sm`) :
  - Auto : `Image de la première histoire du pack (« {titre} »).`
  - Story épinglée : `Depuis l'histoire « {titre} ».`
  - Upload : `Image importée.`
- Bouton "Changer l'image" (`variant="outline"`) ouvre `PackCoverDialog`
- Bouton "Réinitialiser" (`variant="ghost"`, icône `RotateCcw`) : remet `packCover = { type: "auto" }`, uniquement rendu si un override est actif (règle UX : ne jamais afficher un contrôle qui n'aurait aucun effet)

### `PackCoverDialog` (shadcn `Dialog` + `Tabs`, réutilisent les composants déjà installés spec 04)

Deux onglets (libellés courts et fixes → `Tabs` adapté ici, contrairement à l'étape 3 où les titres longs d'épisodes avaient exclu ce composant) :

**Onglet "Depuis les histoires"** (actif par défaut)

- Grille responsive (`grid-cols-3 sm:grid-cols-4`) : une vignette carrée par histoire actuellement dans `state.stories`, chacune un `<button>` avec `aria-label="Utiliser l'image de {titre}"`
- Histoire correspondant à `effectiveSource` actuelle : `ring-2 ring-primary` + icône `Check` en surimpression (coin haut-droit) — l'indicateur de sélection ne repose jamais sur la seule couleur
- Clic sur une vignette → `packCover = { type: "story", storyId }` immédiatement, toast succès (`sonner`) "Image du pack mise à jour.", fermeture de la boîte de dialogue

**Onglet "Importer une image"**

- Zone de dépôt (`border-2 border-dashed rounded-lg`, icône `Upload`/`ImageUp`) : "Glisser une image ici ou cliquer pour parcourir" + aide `JPEG, PNG ou WebP — {MAX_COVER_UPLOAD_MB} Mo max. Recadrée automatiquement en carré.`
- `<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only">` déclenché par la zone (clic ou glisser-déposer)
- Validation **client** immédiate (type MIME + taille) avant tout envoi réseau → erreur inline (`Alert variant="destructive"` dans la boîte de dialogue, pas de toast car bloquant/contextuel) si invalide, la boîte de dialogue reste ouverte
- Fichier valide → aperçu local immédiat (`URL.createObjectURL`) + bouton "Utiliser cette image" (`variant="default"` accent)
- Au clic sur "Utiliser cette image" : état de chargement (spinner sur le bouton, "Import…"), appel à `uploadPackCoverAction(sessionId, formData)`
  - Succès → `packCover = { type: "upload", path, url }`, toast succès, fermeture de la boîte de dialogue, révocation de l'URL objet locale (`URL.revokeObjectURL`)
  - Échec → `Alert` destructive inline avec le message d'erreur retourné, boîte de dialogue reste ouverte, aperçu local conservé pour réessayer

**Pied de la boîte de dialogue** : bouton "Fermer" (`variant="ghost"`), pas de bouton "Valider" global (chaque action de sélection/import s'applique immédiatement).

### Réactions aux changements d'état du pack

- Réordonnancement des histoires (drag & drop existant) : si `packCover.type === "auto"`, l'aperçu suit automatiquement la nouvelle première histoire (recalcul via `resolvePackCoverImagePath`, pas d'action supplémentaire) ; si `type === "story"` ou `"upload"`, le réordonnancement n'a aucun effet sur l'image choisie
- Suppression d'une histoire (`Dialog` de confirmation déjà existant à cette étape) : si l'histoire supprimée est celle référencée par `packCover.type === "story"`, un `useEffect` détecte que `resolvePackCoverImagePath(...).effectiveSource.type === "auto"` alors que `state.packCover.type === "story"`, persiste `packCover = { type: "auto" }` et affiche un toast `"L'histoire utilisée comme image du pack a été retirée : image automatique réappliquée."`

### Résolution finale à l'export (`doExport`)

Avant `validatePackDraftClient`/`exportPackAction`, une fois `pack` construit via `createPackDraft` + `addStoryToPack` (boucle existante), écraser explicitement la valeur automatique :

```typescript
const resolved = resolvePackCoverImagePath(state.packCover, state.stories.map(s => ({ id: s.episode.id, coverImagePath: s.coverImagePath })));
pack = { ...pack, coverImagePath: resolved.path };
```

## Accessibilité

- Vignettes de la galerie : véritables `<button>`, `aria-label` explicite, focus visible (`focus-visible:ring`), sélection indiquée par icône + style (pas uniquement une couleur)
- Zone de dépôt de fichier : opérable au clavier (le `<label>`/`<button>` englobant déclenche l'`<input type="file">` natif via `Enter`/`Espace`)
- `DialogTitle`/`DialogDescription` renseignés ("Changer l'image du pack" / "Choisis une image parmi tes histoires ou importe la tienne.")
- Erreurs d'import annoncées via `Alert` (texte visible, pas seulement une couleur de bordure)
- Cibles tactiles ≥ 44×44px pour tous les boutons, y compris les vignettes de la galerie

## Sécurité (rappel `.cursor/rules/020-security-privacy.mdc`)

- Aucun accès réseau sur cette fonctionnalité (upload = fichier local de l'utilisateur, pas d'URL externe à récupérer) → pas de garde anti-SSRF nécessaire ici
- Validation stricte du type MIME et de la taille **avant** tout traitement disque/`sharp`, côté serveur (la validation client est un confort UX, jamais une garantie de sécurité)
- Pas de SVG accepté (évite tout risque de parsing XML malicieux)
- Nom de fichier de sortie toujours généré par le serveur (`upload.jpg`), jamais dérivé du nom de fichier fourni par l'utilisateur
- Action enveloppée dans le sémaphore existant (`withConcurrencyLimit`), cohérent avec les autres traitements lourds du pipeline média sur ce déploiement public sans authentification

## Tests

- `cover.test.ts` (nouveau, `src/lib/pack/`) :
  - `auto` avec plusieurs histoires → retourne le `coverImagePath` de la première (selon l'ordre du tableau fourni)
  - `story` avec un id présent → retourne le bon `coverImagePath`, `effectiveSource` inchangé
  - `story` avec un id absent (histoire retirée) → fallback sur la première histoire, `effectiveSource: { type: "auto" }`
  - `upload` → retourne le `path` fourni tel quel, quel que soit le contenu de `stories`
- `studio-format.test.ts` (mise à jour) :
  - Cas 1 histoire avec `pack.coverImagePath` explicitement différent de `story.coverImagePath` → le nœud `cover` utilise `pack.coverImagePath`
  - Cas 1 histoire avec `pack.coverImagePath` vide (`""`) → non-régression, le nœud `cover` retombe sur `story.coverImagePath`

## Critère d'acceptation manuel

- Par défaut, sans aucune action, l'image du pack reste celle de la première histoire (comportement inchangé) — vérifié en import Lunii Admin Builder sur un pack 1 histoire et un pack multi-histoires
- Choisir une autre histoire du pack comme image, puis réordonner les histoires : l'image choisie ne change pas ; exporter et importer confirme que le bon asset est utilisé comme `cover`
- Importer une image personnalisée (JPEG et PNG), exporter, importer dans Lunii Admin Builder : l'image apparaît bien en carré, sans déformation
- Supprimer l'histoire actuellement épinglée comme image du pack : le toast de réinitialisation apparaît, l'export utilise ensuite l'image automatique sans erreur
- `npm run lint` et `npm run build` toujours au vert après implémentation
