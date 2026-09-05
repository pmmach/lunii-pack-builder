# Format cible : pack compatible Lunii Admin Web

Source : [olup/lunii-admin](https://github.com/olup/lunii-admin) (moteur derrière [Lunii Admin Web](https://lunii-admin-web.pages.dev/)) et [marian-m12l/studio (STUdio)](https://github.com/marian-m12l/studio).

## Arborescence attendue par le créateur de pack (cible du MVP)

Lunii Admin Web sait convertir une **arborescence de dossiers** en pack STUdio (`.zip`) installable via son bouton *"create pack"*. C'est cette arborescence que notre application doit produire :

```
pack-name/
    title.mp3          # audio joué au survol/sélection du pack dans le menu
    cover.jpeg          # vignette du pack
    md.yaml             # métadonnées du pack

    premiere-histoire/
        title.mp3       # "intro" : audio joué à la sélection de l'histoire
        cover.jpeg      # vignette de l'histoire
        story.mp3       # contenu de l'histoire

    deuxieme-histoire/
        title.mp3
        cover.jpeg
        story.mp3
```

Contenu de `md.yaml` :

```yaml
title: <Titre du pack>
description: <Description du pack>
uuid: <UUID v4 généré>
```

Chaque sous-dossier d'histoire est un nœud du pack. Un pack à une seule histoire est simplement un pack avec un seul sous-dossier.

## Format final (pour information, généré par Lunii Admin Web, pas par nous en v1)

Le format STUdio final (que Lunii Admin Web génère à partir de l'arborescence ci-dessus) est une archive `.zip`/`.7z` :

```
assets/            # tous les mp3/images référencés
story.json         # graphe de l'histoire (stage nodes = image+son, action nodes = transitions)
thumbnail.png
```

- Images supportées : PNG, JPEG, BMP 24-bits (converties automatiquement si besoin)
- Audio supporté : MP3, OGG/Vorbis, WAVE (converti automatiquement si besoin)
- Un outil communautaire de vérification ([studio-pack-checker](https://github.com/NSV/studio-pack-checker)) attend des images en **320x240**

**Décision** : en v1, on ne régénère pas ce format directement — on délègue cette étape à Lunii Admin Web, qui la maîtrise déjà et la maintient à jour avec les évolutions du firmware Lunii. Cela réduit fortement la complexité et le risque de rupture de compatibilité. Voir `plan/02-roadmap-implementation.md` pour une éventuelle évolution en v2 (génération directe du pack final, import direct sur l'appareil).

## Contraintes images à respecter dans notre pipeline

- Format de sortie : JPEG
- Dimensions cible : **320x320** pour les vignettes (pack et histoire), recadrage centré automatique depuis l'image source (cover de podcast, généralement carrée ou proche), avec possibilité de recadrage manuel par l'utilisateur
- Poids raisonnable (compression JPEG qualité ~85) pour rester léger sur l'appareil Lunii

## Contraintes audio à respecter dans notre pipeline

- Format de sortie : MP3
- Pas de contrainte stricte de fréquence d'échantillonnage/bitrate côté Lunii Admin Web (conversion automatique en aval), mais on normalisera en sortie (ex: 44.1kHz, mono ou stéréo, ~128kbps) pour garder des fichiers légers et cohérents
