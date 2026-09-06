# Contexte et besoin

## Le processus manuel actuel

1. Installer l'extension navigateur "Video DownloadHelper"
2. Télécharger un podcast (ex: [Une histoire et... Oli](https://www.radiofrance.fr/franceinter/podcasts/une-histoire-et-oli), France Inter)
3. Faire le montage de l'histoire et créer les images (320x320 / 320x240)
4. Découper l'audio avec Audacity, exporter en `.mp3`
5. Installer Java JDK, lancer Studio Lunii V3, assembler le pack manuellement

Ce processus est long, répétitif, nécessite plusieurs outils (extension navigateur, Audacity, JDK, Studio Lunii) et une bonne dose de manipulation manuelle pour chaque histoire.

## Besoin exprimé

Une application web simple permettant de :

- Saisir l'URL d'une page de podcast (épisode unique ou émission avec plusieurs épisodes), par exemple :
  - France Inter / Radio France : `https://www.radiofrance.fr/franceinter/podcasts/bestioles/l-anemone-de-mer-bouche-a-tout-faire-2591691`
  - Spotify : `https://open.spotify.com/show/2kRvsf2hPuQFVPax4jE4WT`
- Générer automatiquement un pack STUdio (`.zip` avec `story.json` + `assets/`) compatible avec [Lunii Admin Builder](https://lunii-admin-builder.pages.dev/) / [Lunii Admin Web](https://lunii-admin-web.pages.dev/), contenant a minima :
  - un titre, un auteur, une description
  - une image vignette (pack) et, si possible, une vignette propre à chaque histoire
  - une intro en `.mp3`
  - l'histoire en `.mp3`
- Gérer des packs contenant plusieurs histoires (plusieurs épisodes d'une même émission dans un seul pack Lunii), en associant à chaque histoire son image lorsqu'elle est disponible sur la source
- L'étape manuelle restante : importer le `.zip` dans Lunii Admin Builder/Web pour l'installer sur l'appareil via USB

## Ce que ce document ne couvre pas

Les exigences fonctionnelles détaillées, le format technique cible et les contraintes légales sont traités dans les documents séparés de ce dossier `requirements/`. Le choix de stack et l'architecture sont dans `plan/`.
