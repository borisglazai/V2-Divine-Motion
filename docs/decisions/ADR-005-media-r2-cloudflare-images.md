# ADR-005 — R2 + Cloudflare Images pour les médias

**Décision.** R2 comme stockage du master web de publication ; Cloudflare Images (ou Image Resizing — voir point non résolu ci-dessous) pour les transformations à la demande (thumbnail/medium/large/formats modernes).

**Contexte.** Le site ne doit pas devenir l'archive maître des RAW, et ne doit pas développer de pipeline maison de génération de tailles, comme l'a fait l'ancien projet (colonnes `original/thumbnail/mobile/desktop` pré-générées dans `media`).

**Pourquoi.** Moins de code, moins de stockage dupliqué, moins de surface de bug ; les transformations à la demande délèguent ce travail à Cloudflare plutôt qu'à du code maison.

**Alternatives.** Pipeline maison de génération de tailles (écarté, exactement le problème de l'ancien projet). Service tiers de transformation d'images hors Cloudflare (écarté, cf. ADR-001 — un seul fournisseur).

**Conséquences.** **Point non résolu, à trancher en Phase 4** : Cloudflare Images et Image Resizing sont deux produits Cloudflare distincts avec des modèles de coût différents (stockage géré par image vs redimensionnement à la volée sur le CDN). Le choix explicite doit être documenté en mise à jour de cet ADR avant implémentation, avec son impact budgétaire.
