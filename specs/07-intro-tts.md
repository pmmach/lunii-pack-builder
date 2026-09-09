# Spec 07 — Intro audio TTS (découpée vs synthétique)

Contexte : règle d'intro actuelle dans `specs/03-pack-builder-export.md` (clip N secondes) et UI étape édition dans `specs/04-ui-ux-parcours.md`. Contraintes légales TTS : `requirements/03-contraintes-legales-et-risques.md`.

## Objectif

Permettre à l'utilisateur de choisir, pour tout le pack, entre :

1. **Découpée** (`clip`) — comportement historique : N premières secondes du contenu découpé
2. **Synthétique** (`tts`) — synthèse vocale cloud du **titre** de chaque histoire (et du titre du pack en multi-histoires), voix enfant française

Génération à l'**export** + aperçu à la demande. Pas de TTS pendant la préparation des épisodes.

## Décisions

| Point | Décision |
|---|---|
| Portée | Réglage **pack-wide** (`SessionState.introMode` / `PackDraft.introMode`), pas par histoire |
| Défaut | `"tts"` — les sessions déjà enregistrées en `"clip"` restent en clip |
| Texte lu | Titre affiché de l'histoire ; multi → aussi titre du pack. Pas de champ texte séparé |
| Langue v1 | Français figé côté UI ; `TTS_LANGUAGE` / `TTS_VOICE` en env pour plus tard |
| Provider défaut | **Edge TTS** (sans clé, voix `fr-FR-EloiseNeural`) via `edge-tts-universal` |
| Provider alt. | Azure Speech / Google Cloud TTS (clés API) |
| Sans secrets | Avec `TTS_PROVIDER=edge` (défaut), le mode synthétique est **toujours disponible**. Avec azure/google sans clés : option désactivée |
| Échec TTS | Export échoue (pas de fallback silencieux vers clip) |

## Variables d'environnement (`src/lib/shared/env.ts`)

```typescript
TTS_PROVIDER: z.enum(["edge", "azure", "google"]).default("edge"),
TTS_LANGUAGE: z.string().default("fr-FR"),
TTS_VOICE: z.string().default("fr-FR-EloiseNeural"),
TTS_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),
TTS_MAX_CONCURRENT: z.coerce.number().int().positive().default(1),
TTS_MAX_CHARS: z.coerce.number().int().positive().default(200),
AZURE_SPEECH_KEY: z.string().optional(),
AZURE_SPEECH_REGION: z.string().optional(),
GOOGLE_TTS_API_KEY: z.string().optional(),
```

TTS « configuré » :

- `edge` → toujours (aucune clé)
- `azure` → `AZURE_SPEECH_KEY` et `AZURE_SPEECH_REGION` non vides
- `google` → `GOOGLE_TTS_API_KEY` non vide

## Types

### `src/lib/pack/types.ts`

```typescript
export type IntroMode = "clip" | "tts";

export interface PackDraft {
  // ...champs existants...
  introMode?: IntroMode; // défaut "tts"
}
```

### `src/lib/session/client-store.ts`

```typescript
introMode: IntroMode; // défaut "tts"
```

- `loadSession` : `introMode: parsed.introMode === "clip" ? "clip" : "tts"`
- `src/app/page.tsx` : initialiser `introMode: "tts"` à la création de session

## Module `src/lib/tts/`

### `types.ts`

```typescript
export interface TtsSynthesizeInput {
  sessionId: string;
  text: string;
}

export interface TtsSynthesizeResult {
  filePath: string; // absolu workspace/.../tts/<hash>.mp3
  cacheHit: boolean;
}

export interface TtsProvider {
  readonly id: "azure" | "google";
  synthesize(
    text: string,
    outputPath: string
  ): Promise<Result<{ filePath: string }>>;
}
```

### `sanitize.ts`

```typescript
export function sanitizeTitleForTts(raw: string, maxChars?: number): string;
```

- Trim, collapse whitespace, strip tags HTML
- Tronquer à `env.TTS_MAX_CHARS` (défaut 200) sur une frontière de mot si possible
- Si résultat vide après sanitize → `err` côté appelant (« Titre vide, impossible de générer la voix »)

### `cache.ts`

```typescript
export function ttsCacheKey(parts: {
  provider: string;
  voice: string;
  language: string;
  text: string;
}): string; // SHA-256 hex (64 chars)

export function ttsCachePath(sessionId: string, hash: string): string;
// workspace/<sessionId>/tts/<hash>.mp3
```

### `index.ts`

```typescript
export function isTtsConfigured(): boolean;
export function getTtsProvider(): Result<TtsProvider>;
export async function synthesizeTitle(
  input: TtsSynthesizeInput
): Promise<Result<TtsSynthesizeResult>>;
```

- `synthesizeTitle` : sanitize → chemin cache → si fichier existe, `cacheHit: true` → sinon `withTtsConcurrencyLimit` + provider.synthesize → écrit MP3
- Sérialisation via sémaphore dédié borné par `TTS_MAX_CONCURRENT` (défaut 1)

### `providers/edge.ts`

- Lib `edge-tts-universal` (WebSocket Read Aloud Microsoft Edge, **sans clé**)
- Voix par défaut `fr-FR-EloiseNeural` (enfant)
- Timeout `TTS_TIMEOUT_MS` ; erreurs réseau → message FR

### `providers/azure.ts`

- POST `https://{region}.tts.speech.microsoft.com/cognitiveservices/v1`
- Headers : `Ocp-Apim-Subscription-Key`, `Content-Type: application/ssml+xml`, `X-Microsoft-OutputFormat: audio-16khz-128kbitrate-mono-mp3`
- Body SSML : `<speak version="1.0" xml:lang="..."><voice name="...">texte échappé</voice></speak>`
- Timeout `TTS_TIMEOUT_MS` ; 429 → message « Quota TTS atteint, réessaie plus tard. »

### `providers/google.ts`

- POST `https://texttospeech.googleapis.com/v1/text:synthesize?key=...`
- Body JSON : `input.text`, `voice.languageCode` + `voice.name`, `audioConfig.audioEncoding: "MP3"`
- Décoder `audioContent` (base64) → fichier MP3

## Intégration export (`write-to-disk.ts`)

```typescript
async function resolveTitleAudioPath(
  story: StoryDraft,
  tempDir: string,
  clipSeconds: number,
  introMode: IntroMode,
  sessionId: string
): Promise<Result<string | undefined>>;
```

- Si `story.titleAudioPath` déjà fourni → le garder
- Si `introMode === "tts"` → `synthesizeTitle({ sessionId, text: story.title })` → chemin
- Sinon (clip) → logique actuelle (N secondes / 0 = undefined)

Après résolution des histoires, si `introMode === "tts"` et `stories.length > 1` :

```typescript
const packIntro = await synthesizeTitle({ sessionId: pack.sessionId, text: pack.title });
resolvedPack.titleAudioPath = packIntro.data.filePath;
```

## Server Actions (`src/lib/actions/tts.ts`)

```typescript
"use server";
export async function getTtsStatusAction(): Promise<Result<{ configured: boolean; provider: string }>>;
export async function synthesizeTitleAction(
  sessionId: string,
  text: string
): Promise<Result<{ url: string; cacheHit: boolean }>>;
```

- `getTtsStatusAction` : pas de rate limit (lecture config)
- `synthesizeTitleAction` : `checkRateLimit(ip, "tts")` puis `synthesizeTitle` ; retourne URL `/api/workspace/<sessionId>/tts/<hash>.mp3`

Étendre `Bucket` dans `rate-limit.ts` : `"resolve" | "export" | "tts"`.

## UI

### Composant `src/components/intro-mode-card.tsx` (`"use client"`)

Props :

```typescript
{
  introMode: IntroMode;
  clipSeconds: number;
  ttsConfigured: boolean;
  disabled?: boolean;
  previewTitle?: string; // titre de l'histoire ouverte (aperçu)
  sessionId: string;
  onIntroModeChange: (mode: IntroMode) => void;
  onClipSecondsCommit: (seconds: number) => void;
}
```

- `RadioGroup` Découpée / Synthétique (cibles ≥ 44px, labels associés)
- Mode clip : slider existant + aide actuelle
- Mode tts : aide + bouton « Écouter un aperçu » (appelle `synthesizeTitleAction` avec `previewTitle`) + `<audio controls>` ; spinner / disabled pendant l'appel
- Si `!ttsConfigured` : radio Synthétique `disabled` + `Alert` « La voix synthétique n'est pas configurée sur ce serveur »

### Étape édition (`page.tsx`)

Remplacer `IntroDurationSlider` par `IntroModeCard`. Sous la waveform, texte d'aide conditionnel selon `introMode`.

### Étape pack

Si `introMode === "tts"` et `stories.length >= 2` : bouton aperçu du titre du pack sous le champ titre (même pattern).

### Export

Si `introMode === "tts"`, message de progression « Voix des titres… » avant / pendant l'assemblage.

## Workspace

```
workspace/<sessionId>/
  tts/
    <sha256>.mp3
```

Nettoyé avec le reste de la session (TTL / purge existante).

## Tests

- `sanitize.test.ts` : HTML, espaces, troncature
- `cache.test.ts` : même texte → même hash ; voix différente → hash différent
- `azure.test.ts` / `google.test.ts` : fetch mocké, body/headers, 429 → message FR, timeout
- `write-to-disk.test.ts` : défaut (sans `introMode`) → intro TTS ; `introMode: "tts"` multi → pack.titleAudioPath ; clip 0 inchangé
- `rate-limit.test.ts` : bucket `tts`

## Critères d'acceptation

- [ ] Mode clip : packs 1 et N histoires inchangés (y compris 0 s = pas d'intro)
- [ ] Mode tts : aperçu rapide ; export produit des MP3 d'intro = titres lus
- [ ] Multi + tts : cover pack = titre pack ; menus = titres histoires
- [ ] Sans clés : radio synthétique disabled, clip fonctionne
- [ ] Échec TTS → export en erreur (pas de zip partiel silencieux)
- [ ] `npm run lint`, `npx vitest run`, `npm run build` au vert
