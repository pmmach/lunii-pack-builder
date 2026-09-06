# Format cible : pack STUdio final (compatible Lunii Admin Builder / Lunii Admin Web)

Sources : [olup/lunii-admin](https://github.com/olup/lunii-admin) (moteur derrière [Lunii Admin Web](https://lunii-admin-web.pages.dev/)), [olup/lunii-admin-builder](https://github.com/olup/lunii-admin-builder) (moteur derrière [Lunii Admin Builder](https://lunii-admin-builder.pages.dev/), code source public), et [marian-m12l/studio (STUdio)](https://github.com/marian-m12l/studio).

## Décision (v1) : notre application génère directement le format final

Notre application génère directement une archive `.zip` au **format STUdio final** (`story.json` + `assets/`), le même que celui produit par Lunii Admin Builder. L'utilisateur télécharge ce zip et l'importe dans [Lunii Admin Builder](https://lunii-admin-builder.pages.dev/) (qui sait *importer* un zip existant, pas seulement en créer) ou [Lunii Admin Web](https://lunii-admin-web.pages.dev/) pour l'installer sur l'appareil via USB — cette étape reste manuelle car l'écriture sur l'appareil nécessite WebUSB/WebHID depuis un navigateur avec accès physique au device, ce que notre app serveur ne peut pas faire.

Ce choix a été validé après analyse d'un pack réel (`l_anemone_de_mer_bouche_a_tout_faire.zip`, un pack Radio France, analysé le 05/09/2026) et lecture du code source exact de génération de olup/lunii-admin-builder (`src/utils/generate/generate.ts`, `src/types.ts`, `src/utils/zip.ts`).

## Format de l'archive `.zip`

Contenu à la racine de l'archive (pas de dossier parent) :

```
story.json         # graphe de l'histoire (stage nodes = image+son, action nodes = transitions)
assets/
    <10 caractères alphanumériques aléatoires>.<ext>   # un fichier par image/audio référencé
    ...
```

- Images supportées : PNG, JPEG, BMP 24-bits (pas de recompression forcée : le format source peut être conservé tel quel)
- Audio supporté : MP3, OGG/Vorbis, WAVE
- Un outil communautaire de vérification ([studio-pack-checker](https://github.com/NSV/studio-pack-checker)) attend des images en **320x240** pour les vignettes de sélection

## Schéma de `story.json`

```json
{
  "format": "v1",
  "version": 2,
  "uuid": "<uuid, identique à celui du stage node \"cover\">",
  "title": "<titre du pack>",
  "author": "<auteur du pack>",
  "description": "<description du pack>",
  "source": "LUNII_PACK_BUILDER",
  "stageNodes": [ /* voir ci-dessous */ ],
  "actionNodes": [ /* voir ci-dessous */ ]
}
```

`title`, `author` et `description` sont **obligatoires** (le générateur de référence lève une erreur sinon).

### Stage node

```json
{
  "uuid": "<uuid>",
  "image": "<nom de fichier dans assets/, ou null>",
  "audio": "<nom de fichier dans assets/, ou null>",
  "type": "cover" | "menu" | "story",
  "name": "<= uuid>",
  "okTransition": { "actionNode": "<uuid action node>", "optionIndex": 0 } | null,
  "homeTransition": { "actionNode": "<uuid action node>", "optionIndex": 0 } | null,
  "controlSettings": { "wheel": bool, "ok": bool, "home": bool, "pause": bool, "autoplay": bool },
  "squareOne": true // uniquement sur le premier noeud (le "cover")
}
```

Deux jeux de `controlSettings` fixes selon le rôle du noeud :

| Rôle | wheel | ok | home | pause | autoplay |
|---|---|---|---|---|---|
| `cover` / `menu` (interactif, navigation molette) | true | true | true | false | false |
| `story` (lecture automatique) | false | false | true | true | true |

### Action node

```json
{ "id": "<uuid>", "uuid": "<= id>", "name": "<= id>", "options": ["<uuid stage node>", ...] }
```

Relie un noeud interactif (`cover`/`menu`) à un ou plusieurs stage nodes suivants (plusieurs options = choix/branchement, non utilisé par notre pipeline qui ne produit que des séquences linéaires).

### Construction du graphe selon le nombre d'histoires

**1 seule histoire** (vérifié sur un pack réel) — le noeud `cover` du pack **reprend directement** l'image et l'intro de cette histoire (pas de niveau intermédiaire) :

```
cover (image=cover histoire, audio=intro histoire, squareOne) --okTransition--> action --options:[story]--> story (audio=contenu histoire)
```

**Plusieurs histoires** — le noeud `cover` porte l'image/intro du **pack**, et chaque histoire devient un noeud `menu` intermédiaire (sa propre image/intro) menant à son propre noeud `story` :

```
cover (pack) --okTransition--> action racine --options:[menu1, menu2, ...]
  menu1 (histoire 1) --okTransition--> action1 --options:[story1]--> story1
  menu2 (histoire 2) --okTransition--> action2 --options:[story2]--> story2
  ...
```

`homeTransition` : `null` sur `cover` et sur chaque `menu` (retour à la bibliothèque de packs par défaut) ; sur chaque `story`, pointe vers `{ actionNode: <action racine>, optionIndex: <position de son histoire> }` (retour au menu du pack, positionné sur la bonne histoire). Cette partie multi-histoires est une extrapolation fidèle de l'algorithme source (non vérifiée sur un pack réel à plusieurs histoires).

## Contraintes images à respecter dans notre pipeline

- Format de sortie : JPEG
- Dimensions cible : **320x320** pour les vignettes (pack et histoire), recadrage centré automatique depuis l'image source (cover de podcast, généralement carrée ou proche), avec possibilité de recadrage manuel par l'utilisateur
- Poids raisonnable (compression JPEG qualité ~85) pour rester léger sur l'appareil Lunii

## Contraintes audio à respecter dans notre pipeline

- Format de sortie : MP3
- On normalise en sortie (ex: 44.1kHz, mono ou stéréo, ~128kbps) pour garder des fichiers légers et cohérents

## Annexe : ancien format intermédiaire (non utilisé depuis la génération directe)

Avant la génération directe du format final, notre application produisait une **arborescence de dossiers** (`pack-name/title.mp3+cover.jpeg+md.yaml/histoire/title.mp3+cover.jpeg+story.mp3`) destinée à être convertie par le bouton *"create pack"* de Lunii Admin Web. Ce format reste documenté ici pour référence (c'est toujours celui attendu par Lunii Admin Web si on préfère passer par cette voie) :

```
pack-name/
    title.mp3          # audio joué au survol/sélection du pack dans le menu
    cover.jpeg          # vignette du pack
    md.yaml             # métadonnées du pack (title/description/uuid)

    premiere-histoire/
        title.mp3       # "intro" : audio joué à la sélection de l'histoire
        cover.jpeg      # vignette de l'histoire
        story.mp3       # contenu de l'histoire
```
