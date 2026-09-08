# Contraintes légales et risques

⚠️ Ce document donne un cadrage produit, **pas un avis juridique**. En cas de doute sur un usage précis, se renseigner davantage ou consulter un professionnel.

## Principe retenu

- L'application ne télécharge que de l'audio exposé publiquement via un **flux RSS de podcast** (mécanisme standard, identique à celui utilisé par toute application d'écoute de podcasts type Apple Podcasts, AntennaPod, etc.). Ce n'est pas du contournement de protection.
- L'usage visé est **personnel et familial** (fabriquer des packs pour l'appareil Lunii de ses enfants), pas la redistribution ou la republication du contenu.
- Chaque émission/éditeur conserve ses propres conditions d'utilisation ; l'application ne doit pas prétendre transférer un droit de redistribution.

## Ce qui est explicitement exclu

- **Extraction audio depuis Spotify** ou toute plateforme utilisant du DRM / streaming chiffré : techniquement non supporté par l'app, et cela constituerait un contournement de mesure de protection (illégal dans de nombreuses juridictions, dont la France - art. L331-5 CPI). Si une URL Spotify est fournie, l'app tente uniquement de retrouver le **flux RSS public équivalent** de la même émission ; si aucun flux public n'existe, elle affiche clairement que l'émission ne peut pas être traitée.
- Pas de scraping de sites nécessitant une authentification ou contournant un paywall.
- Pas de fonctionnalité de partage/publication en masse des packs générés.

## Bonnes pratiques à implémenter techniquement

- Liste blanche/heuristique de domaines "sûrs" (flux RSS, pages avec balise `<link rel="alternate" type="application/rss+xml">`) plutôt qu'un scraping générique agressif
- Respect raisonnable des serveurs sources : timeouts, retry limité, pas de téléchargement parallèle massif, user-agent identifiable
- Un bandeau/mention dans l'app rappelant l'usage personnel visé et la nécessité de respecter les droits des ayants droit

## Synthèse vocale (TTS) pour les intros

Quand l'utilisateur choisit l'intro **synthétique**, l'app synthétise le titre de l'histoire / du pack. Provider par défaut : **Edge TTS** (service Read Aloud de Microsoft Edge, **sans compte ni clé**, via `edge-tts-universal`). Alternatives optionnelles : Azure Speech ou Google Cloud TTS (clés en env).

Points à connaître :

- L'usage cible reste **personnel et familial** (packs pour ses enfants), pas la republication commerciale d'audio TTS.
- Edge TTS s'appuie sur un endpoint non officiel (communautaire) : il peut casser ou être restreint sans préavis. Ce n'est pas une API Microsoft sous contrat.
- Le palier gratuit Azure Speech **F0** (si utilisé) est un quota d'évaluation ; les droits d'usage commercial de l'audio TTS Azure sont liés au palier payant selon les Product Terms Microsoft.
- Les clés API TTS (`AZURE_SPEECH_KEY`, `GOOGLE_TTS_API_KEY`, etc.) ne doivent jamais être commitées ; elles vivent dans `.env.local` / Coolify.
- Sur un VPS ouvert sans authentification, le TTS peut être **abusé** → rate limiting sur l'aperçu TTS + sérialisation des appels (voir `specs/07-intro-tts.md`).

## Risques identifiés

| Risque | Impact | Mitigation |
|---|---|---|
| Changement de structure des pages/flux d'un éditeur (ex: refonte site Radio France) | Rupture du connecteur | Adapters isolés par source (`lib/sources/`), tests, fallback générique RSS |
| Rupture de compatibilité si Lunii Admin Web change son format d'import | Packs générés invalides | Suivre le repo `olup/lunii-admin(-web)`, tests de non-régression sur la structure de dossier |
| Confusion utilisateur sur ce qui est légal (Spotify notamment) | Mauvais usage | Message explicite dans l'UI quand une source n'est pas supportée |
| Outil déployé sur un VPS **sans authentification**, accessible à quiconque a l'URL | Usage par des tiers non prévus, consommation de ressources serveur (CPU ffmpeg, bande passante, disque) | Ne pas indexer/partager publiquement l'URL du déploiement ; limites techniques légères (durée audio max, nombre de traitements concurrents, purge automatique du disque) — voir `specs/05-deploiement-coolify.md`. Une authentification simple (code d'accès partagé) reste une option future si l'usage abusif devient un problème |
| Abus du TTS (Edge / clé cloud) sur un déploiement public | Charge serveur / épuisement de quota provider | Rate limit bucket `tts`, sérialisation des appels, message d'erreur clair sans fallback silencieux |
| Rupture Edge TTS (endpoint non officiel) | Mode synthétique indisponible | Message d'erreur clair ; bascule possible vers `azure`/`google` via env ; mode découpé reste disponible |
