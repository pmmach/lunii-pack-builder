# Spec 04 — Parcours utilisateur et design

Généré avec l'aide du skill `ui-ux-pro-max` (design system + guidelines UX) et `ui-styling` (conventions shadcn/ui). Dépend des types exposés par les specs 01-03 (peut être développé avec des données mockées en parallèle si ces specs ne sont pas encore terminées, tant que les types sont stables).

## Principe général

Un **parcours en 4 étapes** (pattern "progressive disclosure" recommandé pour ce type d'outil), avec un indicateur d'étape toujours visible (recommandation UX : "Progress Indicators" — ne jamais laisser l'utilisateur sans repère pendant un processus multi-étapes). Une seule route dynamique `/pack/[sessionId]` gère les 4 étapes via un état client (pas de rechargement de page entre étapes), la route `/` ne sert qu'à démarrer une session.

## Design tokens

### Couleurs

À définir dans `src/app/globals.css` (variables CSS shadcn) et reflétées dans `tailwind.config.ts`. Support **light + dark** (basculement automatique via `next-themes`, à installer : `npm install next-themes`).

| Rôle | Light | Dark |
|---|---|---|
| `--background` | `#F0FDFA` | `#0B1120` |
| `--foreground` | `#134E4A` | `#F8FAFC` |
| `--primary` | `#0D9488` (teal-600) | `#2DD4BF` (teal-400) |
| `--primary-foreground` | `#FFFFFF` | `#052E2B` |
| `--secondary` | `#14B8A6` | `#0F766E` |
| `--accent` (CTA) | `#EA580C` (orange-600) | `#FB923C` (orange-400) |
| `--muted` | `#E8F1F4` | `#111827` |
| `--border` | `#99F6E4` | `#1F2937` |
| `--destructive` | `#DC2626` | `#F87171` |
| `--ring` | `#0D9488` | `#2DD4BF` |

Vérifier chaque paire texte/fond avec un contraste ≥ 4.5:1 (texte normal) avant implémentation finale — les valeurs ci-dessus sont un point de départ, pas une garantie absolue une fois assemblées.

### Typographie

Police unique **Inter** (heading + body — cohérent avec un outil technique, lisible, pas de deuxième police à charger) via `next/font/google` :

```typescript
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600", "700"] });
```

### Icônes

`lucide-react` (déjà installé avec shadcn/ui à la spec 00) — ne jamais utiliser d'émojis comme icônes fonctionnelles, un seul style (outline) dans toute l'app, taille cohérente (`size-4`/`size-5` selon contexte).

## Étape 1 — Accueil (`src/app/page.tsx`)

- Titre + une phrase d'explication ("Colle l'URL d'un podcast, on en fait un pack Lunii")
- `Input` (type url) + `Button` "Analyser" (variant `default`, couleur accent)
- Validation inline : sur `onBlur`, vérifier que la valeur ressemble à une URL http(s) valide (regex/`URL` constructor), afficher un message d'erreur sous le champ si invalide (recommandation UX "Inline Validation")
- Au submit : état de chargement sur le bouton (spinner + texte "Analyse en cours…"), appel à `resolveSourceAction`
  - Succès → redirection vers `/pack/[sessionId]` (le `sessionId` est généré côté serveur dans l'action et retourné)
  - Erreur → `Alert` (variant destructive) avec le message d'erreur retourné (jamais de stack trace), le formulaire reste rempli
- Bloc "Comment ça marche" : 3 mini-cartes iconographiées (Lien → Découpe → Export), texte court
- Pied de page : mention discrète "Usage personnel — respecte les droits des créateurs" (cf. `requirements/03-contraintes-legales-et-risques.md`), lien vers [Lunii Admin Web](https://lunii-admin-web.pages.dev/)

## Étape 2 — Sélection des épisodes

Affichée si `SourceResolution.kind === "show"`.

- En-tête : image + titre de l'émission (`showImageUrl`, `showTitle`)
- Si `resolvedFrom === "directory-search"` : bandeau `Alert` (variant par défaut, pas destructive) : "Cette émission a été retrouvée via son flux RSS public (<feedUrl>)."
- Liste des épisodes : `Card` par épisode avec vignette (`next/image`, 64x64), titre, durée formatée (`mm:ss` ou `h mm`), date ; `Checkbox` pour sélection multiple
- Barre de recherche texte (filtre client sur le titre) si plus de 10 épisodes
- Pendant le chargement de la liste : `Skeleton` reproduisant la forme finale des cartes (pas d'écran blanc — recommandation UX "Loading States")
- Bouton "Continuer avec N histoire(s)" désactivé tant qu'aucune sélection

Au clic sur "Continuer" : **quitter immédiatement la liste** (ne jamais laisser la sélection visible pendant ou après le process — c'est ce qui faisait "retomber" à l'étape 1).

Si `kind === "episode"` : cette étape est sautée ; l'unique épisode entre dans le couloir de préparation puis l'étape 3.

## Couloir de préparation (entre étapes 2 et 3)

**Pas une 4ᵉ étape numérotée**, **pas une Dialog** par-dessus la liste. Carte pleine largeur qui remplace le contenu, badges : 1. Épisodes (faite) / 2. Édition (destination active).

- Titre : "Préparation de N histoire(s)"
- `Progress` déterminée + message (`aria-live="polite"`), polling `getJobStatusAction` (intervalle 1s). Plusieurs épisodes en **parallèle** (borné par `MAX_CONCURRENT_JOBS`)
- Bouton "Annuler" : retour volontaire à la sélection (`kind === "show"`) ou à `/` (`kind === "episode"`). Les jobs serveur peuvent finir ; le client ignore le résultat
- Succès → étape 3, fichiers déjà prêts (pas de skeleton waveform)
- Échec → **rester dans le couloir** : `Alert` destructive + "Réessayer" + "Modifier la sélection" (émission) ou "Changer d'URL" (épisode unique). Jamais de retour automatique à la liste

## Étape 3 — Édition par histoire (répétée pour chaque épisode sélectionné)

Sous-étapes affichées dans un **Accordion** shadcn (`src/components/ui/accordion.tsx`, Base UI) — **un seul panneau ouvert à la fois** (pas de barre d'onglets : les titres longs Radio France provoquaient chevauchements/troncatures).

**Réglage commun au pack** (au-dessus de l'accordéon) :
- Slider « Durée de l'intro » (0–30 s, pas de 1 s, défaut 8) — valeur portée sur **toutes** les histoires du pack (`SessionState.defaultTitleClipSeconds` → `PackDraft.defaultTitleClipSeconds` à l'export)
- Texte d'aide : extrait joué à la sélection, pris au début du contenu découpé ; 0 s = pas d'intro

En-tête de chaque item :
- badge `n/N`
- titre **complet** (wrap autorisé, pas de `slice`)
- durée de l'épisode si connue
- badge d'état (« Prête » / « Chargement… »)

Corps (panneau déplié) = édition titre / waveform / vignette.

Le premier épisode de la sélection est ouvert par défaut (`openStoryId`).

Pour chaque histoire :

1. **Titre** : `Input` pré-rempli avec le titre de l'épisode, éditable
2. **Audio** : lecteur avec waveform (`wavesurfer.js`, région de sélection draggable) affichant les peaks retournés par `generateWaveformPeaks` ; poignées début/fin de l'histoire ; texte d'aide rappelant la durée d'intro du pack (« Intro : N s (réglage commun au pack) »)
3. **Image** : aperçu carré 320x320 de la vignette (alt descriptif si image présente)
4. **Progression** pendant les traitements serveur (découpe et export uniquement — la préparation vit dans le couloir ci-dessus) :
   - **Validation / découpe** : appel synchrone à `trimEpisodeAction` sur `source.mp3` (copie de flux, quasi instantanée) ; plusieurs découpes en parallèle si multi-histoires
   - **Export** : messages "Assemblage…", "Compression…"
   - À chaque grande étape (`busy === true`) : recentrage sur la carte de progression (`scrollIntoView`)
   - Pourcentage animé / lissé (plafonné à 97 % avant la fin réelle), avec `message` et `%` visibles

Bouton "Valider et passer au pack" en bas.

## Étape 4 — Composition du pack et export

- Champs **`title`**, **`author`** (obligatoire, prérempli depuis `source.showAuthor`) et `description` du pack (`Input`/`Textarea`)
- Liste ordonnable des histoires ajoutées (`@dnd-kit/sortable`) : vignette + titre + durée + bouton supprimer (icône `Trash2`, confirmation via `Dialog`)
- Bouton "Ajouter une autre histoire (même émission)" → retour à l'étape 2 ; bouton "Nouvelle URL" → retour à `/`
- Bouton principal "Générer le pack" (variant accent) : désactivé tant que titre/auteur vides ou aucune histoire (`validatePackDraftClient`)
- Pendant l'export : `Progress` + message, même recentrage/lissage que l'étape 3
- Résultat : carte de succès avec nom du pack, nombre d'histoires, taille, bouton "Télécharger le .zip", et rappel avec lien vers [Lunii Admin Builder](https://lunii-admin-builder.pages.dev/) / [Lunii Admin Web](https://lunii-admin-web.pages.dev/) : **importer** le zip (pas le bouton "create pack" depuis une arborescence) puis installer sur l'appareil

## Composants shadcn à ajouter (en plus de ceux de la spec 00)

```bash
npx shadcn@latest add checkbox dialog tabs badge textarea sonner slider scroll-area accordion
```

- `accordion` : navigation multi-histoires à l'étape 3 (remplace l'usage des `tabs` pour cette étape ; `tabs` peut rester installé pour d'autres usages)
- `sonner` (toasts) : erreurs non bloquantes ; erreurs bloquantes en `Alert` inline

## Accessibilité (obligatoire, cf. `.cursor/rules/050-ui-ux.mdc`)

- Tous les champs ont un `<Label>` associé (jamais de placeholder seul en guise de label)
- Ordre de tabulation logique, focus visible (`focus-visible:ring`) sur tous les éléments interactifs y compris les poignées de la waveform et les items réordonnables
- Toutes les icônes fonctionnelles (supprimer, recadrer…) ont un `aria-label` explicite en plus de l'icône
- `prefers-reduced-motion` respecté : désactiver/raccourcir les transitions d'entrée des cartes si actif
- Cibles tactiles ≥ 44x44px pour tous les boutons/poignées, y compris sur la waveform

## Responsive

Points de rupture à tester : 375px (mobile), 768px (tablette), 1024px et 1440px (desktop). L'éditeur waveform (étape 3) peut passer en pleine largeur sous 768px ; la liste ordonnable de l'étape 4 passe en cartes empilées sous 768px plutôt qu'en grille.

## Critères d'acceptation

- [ ] Les 4 étapes sont navigables entièrement au clavier
- [ ] Mode sombre fonctionnel via un toggle (icône soleil/lune dans l'en-tête), contrastes vérifiés dans les deux modes
- [ ] Aucun écran blanc pendant un chargement (skeletons ou barres de progression partout où une action serveur > 300ms est en cours)
- [ ] Après "Continuer", la liste d'épisodes disparaît ; on n'y revient que via "Annuler" / "Modifier la sélection"
- [ ] Pendant préparation (couloir) / découpe / export : barre de progression continue (pas de sauts figés longtemps) ; découpe et export recentrent sur la carte (`scrollIntoView`)
- [ ] Testé visuellement aux 4 largeurs listées ci-dessus
- [ ] `npm run lint` et `npm run build` toujours au vert après ajout de l'UI
