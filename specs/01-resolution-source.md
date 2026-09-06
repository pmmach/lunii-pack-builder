# Spec 01 — Résolution de source (URL → épisodes)

Contexte produit : `requirements/01-exigences-fonctionnelles.md` (§ Doit faire) et `requirements/03-contraintes-legales-et-risques.md`.

## Objectif

À partir d'une URL fournie par l'utilisateur, déterminer s'il s'agit d'un épisode ou d'une émission, et retourner la liste des épisodes disponibles avec leurs métadonnées (titre, image, audio, durée), **sans jamais extraire d'audio depuis une plateforme à DRM**.

## Types (`src/lib/sources/types.ts`)

```typescript
export interface EpisodeMeta {
  id: string;              // stable : guid RSS de l'item, sinon hash sha1 de l'audioUrl
  title: string;
  description?: string;
  audioUrl: string;
  imageUrl?: string;
  durationSeconds?: number;
  publishedAt?: string;    // ISO 8601
}

export interface SourceResolution {
  kind: "episode" | "show";
  showTitle: string;
  showAuthor?: string;           // itunes:author / managingEditor / creator du canal RSS
  showImageUrl?: string;
  feedUrl: string;                 // flux RSS effectivement utilisé
  resolvedFrom?: "direct" | "page-discovery" | "directory-search"; // pour affichage UI ("flux retrouvé via...")
  episodes: EpisodeMeta[];         // longueur 1 si kind === "episode"
}
```

## Pipeline de résolution (`src/lib/sources/resolve.ts`)

```typescript
export async function resolvePodcastSource(rawUrl: string): Promise<Result<SourceResolution>>;
```

Étapes séquentielles (on s'arrête à la première qui réussit) :

1. **Validation + garde anti-SSRF** (`src/lib/sources/url-guard.ts`) :
   - `rawUrl` doit parser comme URL absolue, schéma `http:`/`https:` uniquement
   - Résoudre le DNS de l'hôte ; rejeter si l'IP résolue est privée/loopback/lien-local/multicast (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, ::1, fc00::/7) → `err("URL non autorisée", "SSRF_BLOCKED")`
   - Timeout de connexion/réponse : 10s par requête, taille de réponse HTML/XML plafonnée à 5 Mo (couper le stream au-delà)

2. **Flux direct** : si le `Content-Type` de la réponse à `rawUrl` contient `xml` ou `rss`, parser directement avec `rss-parser` → aller à "Construction du résultat"

3. **Découverte depuis une page HTML** (`src/lib/sources/generic-page.ts`) :
   - Fetch de la page, parser avec `cheerio`
   - Chercher dans l'ordre : `<link rel="alternate" type="application/rss+xml" href>`, JSON-LD `<script type="application/ld+json">` avec `@type` contenant `PodcastSeries`/`PodcastEpisode`/`RadioEpisode` (propriété `associatedMedia.contentUrl` ou `contentUrl` pour l'audio direct, `image` pour la vignette), balises `og:title`/`og:image`/`og:audio`
   - Si un flux RSS est trouvé → le parser avec `rss-parser`, `resolvedFrom: "page-discovery"`, puis **enrichir les images d'épisodes** depuis le HTML déjà récupéré via `enrichEpisodeImagesFromPage` (`src/lib/sources/page-images.ts`) : pour chaque épisode, chercher sur la page un nœud dont le texte normalisé correspond exactement au titre, remonter jusqu'à 8 ancêtres pour trouver une `<img>`/`<source srcset>` exploitable (hors logos/icônes `.svg`), et remplacer `imageUrl` uniquement si une image spécifique est trouvée — sinon conserver l'image issue du flux RSS. Utile quand le flux ne fournit qu'une pochette générique identique pour tous les items alors que la page liste une vignette par épisode (ex. pages émissions Radio France).
   - Si aucun flux mais qu'un audio direct + titre sont trouvés via JSON-LD/OG → construire un `SourceResolution` `kind: "episode"` à un seul élément directement depuis ces métadonnées (pas de `feedUrl` dans ce cas, mettre l'URL de la page)

4. **Résolution d'annuaire (Spotify / Apple Podcasts / Deezer)** (`src/lib/sources/directory-resolver.ts`), déclenchée si l'hôte matche `open.spotify.com`, `podcasts.apple.com`, `deezer.com` :
   - Récupérer le nom de l'émission :
     - Spotify : appeler `https://open.spotify.com/oembed?url=<rawUrl>` (endpoint public, pas d'auth) et lire `title`
     - Apple/Deezer : fallback sur le `<title>`/`og:title` de la page
   - Chercher le flux RSS correspondant via l'**iTunes Search API** (publique, sans clé) : `https://itunes.apple.com/search?term=<encodeURIComponent(showName)>&entity=podcast&limit=5`
   - Prendre le premier résultat dont le `collectionName` correspond raisonnablement (comparaison insensible à la casse/accents, similarité simple type Levenshtein ou inclusion de sous-chaîne) et qui possède un `feedUrl`
   - Si trouvé → parser ce flux, `resolvedFrom: "directory-search"`
   - Si rien de concluant → `err("Impossible de trouver un flux RSS public pour cette émission. Les plateformes comme Spotify ne permettent pas le téléchargement direct de l'audio.", "NO_PUBLIC_FEED")`

5. Si aucune étape n'aboutit → `err("Cette page n'est pas reconnue comme un podcast (aucun flux RSS trouvé).", "UNSUPPORTED_SOURCE")`

### Construction du résultat depuis un flux RSS parsé

- `kind: "show"` si le flux contient plusieurs items, `"episode"` si l'URL d'origine pointait vers un item précis identifiable (le cas général sur la v1 : traiter tout flux comme `"show"` et laisser l'utilisateur sélectionner, **sauf** si l'URL de départ correspondait à une page d'épisode unique détectée en étape 3 avec correspondance exacte sur un item du flux — dans le doute, retourner `"show"`, c'est le cas géré par défaut par l'UI)
- Champs par item : `title`, `contentSnippet`/`description` tronqué à 500 caractères, `enclosure.url` comme `audioUrl` (rejeter les items sans enclosure audio), `itunes.image` ou l'image du flux en fallback, `itunes.duration` parsé en secondes (formats `HH:MM:SS`, `MM:SS` ou secondes brutes), `isoDate`/`pubDate`
- Après parsing, si la résolution vient d'une page HTML (`page-discovery`), `enrichEpisodeImagesFromPage` peut remplacer `imageUrl` par une vignette trouvée sur la page (correspondance exacte de titre) ; l'image RSS reste le fallback
- Limiter à 100 épisodes max (les flux peuvent être très longs), trier par date décroissante

## Server Action (`src/lib/actions/resolve-source.ts`)

```typescript
"use server";
export async function resolveSourceAction(rawUrl: string): Promise<Result<SourceResolution>>;
```

Wrapper fin qui appelle `resolvePodcastSource`, ne fait pas de logique supplémentaire (garder la logique testable dans `lib/sources/`, la Server Action reste une fine couche d'exposition).

## Cas limites à gérer explicitement

- Flux RSS avec XML malformé → erreur claire, pas de crash
- Redirections HTTP (jusqu'à 5 sauts, au-delà → erreur)
- Item sans `enclosure` (ex: épisode vidéo uniquement) → exclu silencieusement de la liste, pas d'erreur globale
- Durée manquante → `durationSeconds: undefined`, l'UI affichera "durée inconnue"
- Emission avec 0 épisode exploitable après filtrage → `err("Aucun épisode audio exploitable trouvé dans ce flux.", "NO_EPISODES")`

## Tests (Vitest, fixtures dans `src/lib/sources/__fixtures__/`)

- `rss.test.ts` : fixture `sample-feed.xml` (3-4 items, un sans enclosure) → vérifie le filtrage, le tri par date, le parsing de durée dans ses 3 formats
- `generic-page.test.ts` : fixture `sample-page-with-link.html` (contient `<link rel="alternate" type="application/rss+xml">`), fixture `sample-page-jsonld.html` (JSON-LD sans lien RSS mais avec audio direct), et fixture `sample-page-episode-cards.html` (page d'émission avec une vignette distincte par carte d'épisode) → vérifie que `resolveFromHtmlBody` associe l'image de la carte aux épisodes dont le titre matche et laisse le fallback flux pour les autres ; mocker `fetch` pour ne jamais toucher le réseau
- `directory-resolver.test.ts` : mocker les réponses `oembed` et `itunes search`, vérifier le happy path et le cas `NO_PUBLIC_FEED`
- `url-guard.test.ts` : vérifie le rejet de `http://localhost`, `http://127.0.0.1`, `http://169.254.169.254`, `ftp://...`, et l'acceptation d'une URL publique normale (mocker la résolution DNS)

## Critère d'acceptation manuel

- Coller `https://www.radiofrance.fr/franceinter/podcasts/bestioles/l-anemone-de-mer-bouche-a-tout-faire-2591691` → retourne au moins le titre et l'image de l'épisode
- Coller `https://www.radiofrance.fr/franceinter/podcasts/une-histoire-et-oli` → `showImageUrl` = pochette de l'émission ; parmi les épisodes visibles sur la page, au moins deux ont des `imageUrl` **distinctes** (et différentes de la pochette générique du flux)
- Coller `https://open.spotify.com/show/2kRvsf2hPuQFVPax4jE4WT` → soit retrouve le flux RSS public de "Une histoire et... Oli", soit retourne une erreur `NO_PUBLIC_FEED` claire (les deux issues sont acceptables selon la disponibilité réelle du flux ; ce qui ne l'est pas, c'est un crash ou une tentative de récupérer l'audio Spotify)
