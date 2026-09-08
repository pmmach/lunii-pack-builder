# lib/tts

Synthèse vocale pour les intros audio (spec 07).

- Provider **défaut** : `edge` (`edge-tts-universal`, sans clé — voix Microsoft Edge Read Aloud)
- Alternatives : `azure`, `google` (clés en env)
- `sanitize.ts` — nettoyage / troncature du titre
- `cache.ts` — clé SHA-256 + chemin `workspace/<sessionId>/tts/`
- `providers/` — adapters → MP3
- `index.ts` — factory + `synthesizeTitle` (cache + sémaphore)
