# Technical Architecture — Divine Motion V2

## Stack (confirmée, section 29 de la mise à jour du 15 septembre 2026)

Astro, TypeScript, Cloudflare Workers, D1, R2, Cloudflare Images, Cloudflare Access, Turnstile, Web Analytics, GitHub. Toute modification structurante doit être proposée avant application (ADR requis). Voir `docs/decisions/ADR-001-tech-stack.md`.

## Admin / Visual Editor dans Astro

Îlots Astro (composants interactifs `client:load`) partageant l'arbre de composants avec le site public, dans le même dépôt/Worker. Voir `docs/decisions/ADR-002-visual-editor-vs-page-builder.md` et `ADR-003-curated-work-vs-project-model.md`. Le changement de modèle Travail (curated `work_items` plutôt que Projects) simplifie même la surface de l'éditeur : un seul module de curation plutôt qu'un CRUD projet + galerie imbriquée.

## Découpage Workers

Un Worker principal pour le rendu Astro + API (CMS, contact, publication). Un Worker/Cron Trigger distinct et documenté pour la purge planifiée de la corbeille médias après la période de rétention (voir `docs/MEDIA_ARCHITECTURE.md`) — ce n'est pas une multiplication de backends inutile, c'est une tâche planifiée qui n'a pas de sens dans le cycle requête/réponse du Worker principal.

## Upload de médias

Flux d'upload direct vers R2 par URL présignée (voir `docs/decisions/ADR-006-direct-upload-r2-presigned.md`). Le Worker génère l'URL présignée et enregistre les métadonnées (D1) après confirmation de l'upload ; il ne reçoit jamais le binaire complet d'un fichier ~24 Mpx en proxy.

## Transformations d'images

R2 (master web) → Cloudflare Images (transformations à la demande) → CDN. **Décision encore ouverte** : Cloudflare Images (produit géré, coût par image stockée/livrée) vs Image Resizing (redimensionnement à la volée) sont deux produits Cloudflare distincts avec des modèles de coût différents — à trancher en Phase 4 (voir `docs/decisions/ADR-005-media-r2-cloudflare-images.md`).

## CI/CD

Pipeline minimale sur chaque Pull Request : install → lint → typecheck → tests → build. Aucun merge si un contrôle obligatoire échoue (voir `docs/decisions/ADR-010-ci-pipeline.md`). Déploiement preview recommandé pour QA visuelle avant fusion vers `staging`.

## Environnements

Local, Staging (`staging.divinemotion.ca`), Production (`divinemotion.ca`, `admin.divinemotion.ca`). D1 et R2 isolés par environnement (voir `docs/decisions/ADR-009-environment-strategy.md`). Migrations D1 versionnées, jamais de modification manuelle du schéma.

## Sécurité

Cloudflare Access devant `/admin`. Vérification réelle de la signature du JWT Access côté Worker — jamais de confiance dans un simple en-tête HTTP non signé (voir `docs/decisions/ADR-008-security-access-jwt.md`, et le contre-exemple documenté de l'ancien projet dans `docs/ONBOARDING_REVIEW.md` section 8).
