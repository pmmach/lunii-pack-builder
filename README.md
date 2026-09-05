# Lunii Pack Builder

Application web locale permettant de générer automatiquement des packs d'histoires pour la [Fabrique à histoires Lunii](https://www.lunii.com/), à partir de l'URL d'un podcast (épisode ou émission).

Le pack généré est directement compatible avec **[Lunii Admin Web](https://lunii-admin-web.pages.dev/)** (projet [olup/lunii-admin-web](https://github.com/olup/lunii-admin-web)), qui se charge ensuite de la conversion finale au format STUdio et du transfert vers l'appareil.

## Pourquoi ce projet ?

Le processus manuel actuel (extension de téléchargement vidéo, montage Audacity, Studio Lunii + JDK, etc.) est long et répétitif. Cette application vise à automatiser :

1. La récupération de l'audio et des métadonnées d'un podcast (titre, image, épisode(s))
2. Le découpage / nettoyage de l'audio (remplace Audacity)
3. La génération des vignettes image aux bons formats
4. L'assemblage d'un dossier de pack (voire de plusieurs histoires) prêt à être importé dans Lunii Admin Web

## Documentation du projet

- [`requirements/`](./requirements) — Besoin, exigences fonctionnelles, format cible, contraintes légales
- [`plan/`](./plan) — Stack technique, architecture, roadmap d'implémentation
- [`.cursor/rules/`](./.cursor/rules) — Règles Cursor pour guider le développement (qualité, sécurité, conventions)

## Statut

🚧 Projet en phase de cadrage. Aucun code applicatif n'a encore été écrit — voir [`plan/02-roadmap-implementation.md`](./plan/02-roadmap-implementation.md) pour les prochaines étapes.
