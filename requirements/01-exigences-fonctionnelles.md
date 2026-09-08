# Exigences fonctionnelles

## Analyse et remise en question du besoin initial

Avant de figer les exigences, quelques points du besoin initial ont été challengés :

1. **"Ça doit marcher pour toutes les pages de podcast, y compris Spotify"**
   Spotify ne publie pas de flux RSS public pour la majorité de ses contenus et protège l'audio par DRM : il n'existe pas de moyen légal et fiable de télécharger l'audio brut d'un show Spotify via son URL. À l'inverse, l'écrasante majorité des podcasts (dont **France Inter / Radio France**) publient un flux **RSS public** avec une URL directe vers le fichier audio (`enclosure`) — c'est le mécanisme standard utilisé par toutes les applications de podcast.
   → **Décision** : l'app se branche sur les flux RSS publics. Quand l'utilisateur colle une URL Spotify (ou Apple Podcasts, Deezer...), l'app tente de **retrouver le flux RSS équivalent** via le nom de l'émission (API de recherche type iTunes Search / PodcastIndex), plutôt que de scraper Spotify. Voir `03-contraintes-legales-et-risques.md`.

2. **"Générer un dossier compatible avec Lunii Admin Web"**
   Le format installable sur l'appareil est le pack STUdio (`story.json` + `assets/` dans un `.zip`). Après analyse d'un pack réel et du code source de [olup/lunii-admin-builder](https://github.com/olup/lunii-admin-builder), **notre application génère directement ce format final** (voir `02-format-pack-lunii.md`).
   → **Décision (v1)** : export d'un `.zip` STUdio prêt à être **importé** dans [Lunii Admin Builder](https://lunii-admin-builder.pages.dev/) ou [Lunii Admin Web](https://lunii-admin-web.pages.dev/) pour installation USB sur l'appareil. L'étape manuelle restante (écriture sur le device) est incompressible côté serveur (pas d'accès WebUSB). On ne génère pas le format binaire chiffré/signé interne de la Lunii.

3. **"Une intro + une histoire par pack"**
   Le besoin réel derrière "intro" est probablement : un fichier joué à la sélection de l'histoire dans le menu (`title.mp3`) et le contenu de l'histoire elle-même (`story.mp3`). Ce vocabulaire correspond exactement à la structure attendue par Lunii Admin Web — pas besoin d'un concept supplémentaire.

4. **Découpage audio (remplacer Audacity)**
   Un import brut de podcast contient souvent un habillage (jingle, pub, générique de fin) à couper. Il faut donc un minimum d'édition (sélection d'un point de début/fin) dans l'app, sans viser un éditeur audio complet.

## Périmètre MVP (v1)

### Doit faire

- **Saisie d'une URL** de page de podcast :
  - URL d'un épisode unique → génère un pack à une histoire
  - URL d'une émission (liste d'épisodes) → l'utilisateur sélectionne un ou plusieurs épisodes → génère un pack multi-histoires
- **Résolution de la source** :
  - Détection/lecture du flux RSS (directement, ou via balises `<link rel="alternate" type="application/rss+xml">` / JSON-LD sur la page)
  - Si l'URL est Spotify/Apple/Deezer : recherche du flux RSS correspondant par titre d'émission (API publique de recherche de podcasts), avec confirmation utilisateur
  - Si aucun flux trouvé : message clair, pas de tentative de contournement
- **Récupération des métadonnées** par épisode : titre, description, image de couverture, durée, URL audio
- **Téléchargement de l'audio** depuis l'URL `enclosure` du flux RSS
- **Édition audio minimale** : lecture avec forme d'onde, sélection d'un point de début et de fin (trim), aperçu avant validation
- **Intro audio** (réglage commun au pack) : choix entre
  - **Découpée** (défaut) : les N premières secondes du contenu découpé de chaque histoire (0 = pas d'intro)
  - **Synthétique** : synthèse vocale (TTS cloud) du **titre** de chaque histoire (et du titre du pack en multi-histoires), voix enfant française configurable via variables d'environnement — voir `specs/07-intro-tts.md`
- **Gestion de l'image** :
  - image principale du pack : couverture de l'émission (ou de l'épisode unique)
  - image par histoire : vignette spécifique à l'épisode quand disponible (balise `itunes:image` du flux, sinon enrichissement depuis la page HTML d'origine si celle-ci liste les épisodes avec une image propre — ex. pages podcasts Radio France) ; sinon fallback sur l'image de l'émission
  - recadrage/redimensionnement automatique aux formats requis (320x320 / cover jpeg), possibilité de recadrer manuellement ou d'importer sa propre image
- **Métadonnées du pack** : titre, **auteur** (obligatoire, auto-rempli depuis le flux RSS, éditable), description, titre par histoire, génération automatique d'un UUID
- **Pack multi-histoires** : ajouter/retirer/réordonner plusieurs histoires dans un même pack avant export
- **Export** : génération d'un `.zip` au format STUdio final (`story.json` + `assets/` à la racine), téléchargeable depuis le navigateur, importable dans Lunii Admin Builder / Web

### Ne doit pas faire (hors périmètre v1)

- Extraction audio depuis Spotify/plateformes avec DRM
- Génération du format binaire chiffré/signé interne de la Lunii, ni écriture directe sur l'appareil (USB) — on s'arrête au zip STUdio importable
- Support vidéo
- Transcription / sous-titrage / découpage automatique par IA du contenu
- Comptes utilisateurs, multi-utilisateurs, authentification
- Application mobile

## Exigences non-fonctionnelles

- **Double mode d'exécution** : utilisable en local (`npm run dev` sur la machine de l'utilisateur) **et** déployable sur un VPS personnel via **Coolify** (build Docker), sans changement de code entre les deux — voir `plan/00-stack-technique.md` et `specs/05-deploiement-coolify.md`
- **Pas d'authentification en v1** : l'outil est ouvert, sans compte ni login. Conséquence assumée : quiconque connaît l'URL du déploiement peut l'utiliser. Des garde-fous légers (limites de durée/taille, limitation du nombre de traitements concurrents) sont prévus pour éviter les abus involontaires, sans mettre en place de vraie authentification (voir `requirements/03-contraintes-legales-et-risques.md`)
- **Simplicité d'installation** : un seul outil à lancer (plus besoin de JDK + Studio Lunii + Audacity séparés)
- **Performance raisonnable** : traiter un épisode de 10-15 minutes (téléchargement + recadrage + export) en quelques dizaines de secondes maximum
- **Résilience** : erreurs réseau / flux RSS invalides gérées proprement avec messages compréhensibles
- **Nettoyage** : les fichiers temporaires (audio téléchargé, images intermédiaires) sont nettoyés après export ou sur demande, et via une purge automatique des sessions orphelines (pertinent surtout en déploiement VPS longue durée)
