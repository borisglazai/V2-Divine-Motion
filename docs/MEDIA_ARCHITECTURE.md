# Media Architecture — Divine Motion V2

## Principe

Le site n'est pas l'archive maître des fichiers RAW.

```text
RAW / archives Divine Motion → export master web → R2 → Cloudflare Images → transformations → CDN → site public
```

## Upload

Upload haute résolution (~24 Mpx testé) via un mécanisme d'upload direct sécurisé vers R2 (URL présignée). Le Worker ne doit pas proxyfier inutilement les gros fichiers (voir `docs/decisions/ADR-006-direct-upload-r2-presigned.md` et `docs/TECHNICAL_ARCHITECTURE.md`).

## Métadonnées (D1)

Par média : alt FR/EN, point focal (`focal_x`, `focal_y`), dimensions, poids, date, catégorie, utilisation (référencé par `work_items`, `services`, `testimonials`, contenu de page), `processing_status` (pending/uploaded/ready/failed/abandoned), et autorisation de publication (`publication_rights_confirmed`, `publication_rights_note`, `publication_rights_confirmed_at`) — voir `docs/decisions/ADR-011-publication-rights-model.md` pour le modèle complet (droits au niveau média, garde-fou appliqué à chaque usage public). Schéma détaillé : `docs/DATA_ARCHITECTURE.md` et `docs/drafts/001_initial.sql`.

## Suppression

Soft delete → corbeille → période de rétention → purge physique automatique (Cron Trigger Worker dédié). Un média référencé par `work_items`, `services`, `testimonials` ou le contenu typé des pages est protégé contre la suppression — ce calcul est fiable car le contenu des pages est structuré et typé (pas un blob JSON libre, voir `docs/decisions/ADR-004-structured-typed-content.md`), donc les références à un `media_id` sont toujours des colonnes/relations explicites, jamais du texte libre à parser.

## Sauvegarde/restauration

Stratégie à documenter et tester avant Phase 8 (staging final) : export périodique D1, politique de rétention R2, test de restauration réel (pas seulement une procédure écrite).
