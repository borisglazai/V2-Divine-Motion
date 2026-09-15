# ADR-008 — Cloudflare Access avec vérification JWT réelle

**Décision.** `admin.divinemotion.ca` est protégé par Cloudflare Access, avec vérification réelle et systématique de la signature du JWT Access côté Worker sur chaque route admin/API.

**Contexte.** L'ancien projet faisait confiance à un en-tête HTTP (`oai-authenticated-user-email`) injecté par un dispatcher externe à sa plateforme d'hébergement, sans vérification cryptographique côté application. Ce risque résiduel était documenté et non résolu dans son propre `AUTH_TRUST_MODEL.md` (« si un chemin quelconque permet à un client de positionner lui-même cet en-tête... accès complet immédiat au CMS »).

**Pourquoi.** Ne jamais reproduire un modèle de confiance qui repose sur un en-tête non vérifiable par l'application elle-même. Cloudflare Access fournit un JWT signé vérifiable côté Worker — mais seulement si le code vérifie réellement la signature, pas s'il se contente de lire un en-tête.

**Alternatives.** Confiance dans un en-tête simple positionné par la plateforme (écarté, cf. contexte). Authentification maison (écartée, cf. ADR-001 — s'appuyer sur Cloudflare Access plutôt que réinventer l'auth).

**Conséquences.** Chaque route admin/API doit vérifier le JWT elle-même (ou via un middleware partagé testé), jamais supposer que la frontière réseau suffit. Test prioritaire (voir `docs/TEST_PLAN.md`, point 1).
