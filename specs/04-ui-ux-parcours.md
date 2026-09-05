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

Si `kind === "episode"` : cette étape est sautée, l'unique épisode passe directement à l'étape 3.

## Étape 3 — Édition par histoire (répétée pour chaque épisode sélectionné)

Sous-étapes affichées dans un `Tabs` (un onglet par histoire en cours de préparation) ou une liste séquentielle avec navigation "Suivant" — préférer les `Tabs` shadcn si ≤ 6 histoires, sinon une liste avec accordéon.

Pour chaque histoire :

1. **Titre** : `Input` pré-rempli avec le titre de l'épisode, éditable
2. **Audio** : lecteur avec waveform (`wavesurfer.js`, région de sélection draggable) affichant les peaks retournés par `generateWaveformPeaks` ; deux poignées : "Début/Fin de l'histoire" (obligatoire) et, dans un accordéon "Options avancées" replié par défaut, une plage optionnelle "Extrait pour l'intro" (si non renseignée, l'extrait par défaut de 8s sera utilisé — l'indiquer en texte d'aide)
3. **Image** : aperçu carré 320x320 de la vignette recadrée automatiquement, bouton "Recadrer" ouvrant un `Dialog` avec un crop interactif (glisser pour déplacer le point focal), bouton "Remplacer l'image" (upload fichier local)
4. Affichage de la progression pendant le traitement serveur (téléchargement + trim + waveform) : `Progress` shadcn lié au polling de `getJobStatusAction` (intervalle 1s, `setInterval` nettoyé au démontage du composant), avec le `message` du job affiché sous la barre

Bouton "Valider cette histoire et passer au pack" en bas.

## Étape 4 — Composition du pack et export

- Champs `title` et `description` du pack (`Input`/`Textarea`)
- Liste ordonnable des histoires ajoutées (`@dnd-kit/sortable`) : vignette + titre + durée + bouton supprimer (icône `Trash2` de lucide, avec confirmation via `Dialog` avant suppression définitive)
- Bouton "Ajouter une autre histoire" → retour à l'étape 2 (même émission déjà chargée en mémoire) ou à l'étape 1 (nouvelle URL) au choix de l'utilisateur (deux boutons distincts)
- Bouton principal "Générer le pack" (variant accent) : désactivé tant que `validatePackDraft` (côté client, miroir simplifié de la validation serveur) échoue, avec le motif affiché à côté du bouton
- Pendant l'export : `Progress` + message ("Assemblage du pack…", "Compression…")
- Résultat : carte de succès avec nom du pack, nombre d'histoires, taille du fichier, bouton "Télécharger le .zip" (`<a href={downloadUrl} download>`), et rappel avec lien direct vers [Lunii Admin Web](https://lunii-admin-web.pages.dev/) expliquant l'étape suivante ("Importez ce fichier via le bouton *create pack*")

## Composants shadcn à ajouter (en plus de ceux de la spec 00)

```bash
npx shadcn@latest add checkbox dialog tabs badge textarea sonner slider scroll-area
```

- `sonner` (toasts) : utilisé pour les erreurs non bloquantes (ex: échec de rechargement d'une image), pas pour les erreurs bloquantes qui restent en `Alert` inline

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
- [ ] Testé visuellement aux 4 largeurs listées ci-dessus
- [ ] `npm run lint` et `npm run build` toujours au vert après ajout de l'UI
