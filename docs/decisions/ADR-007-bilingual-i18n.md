# ADR-007 — Bilinguisme FR/EN

**Décision.** FR à la racine sans préfixe, EN sous `/en`. Colonnes dénormalisées `_fr`/`_en` par table (pas de table de traductions générique). Publication indépendante par langue : un contenu EN incomplet n'est jamais publié en EN, indépendamment du statut FR.

**Contexte.** Bilinguisme requis dès le MVP (Master Brief section 12), aucune troisième langue prévue.

**Pourquoi.** Le schéma d'URL (racine FR, préfixe `/en`) est standard et supporté nativement par Astro (`prefixDefaultLocale: false`). La dénormalisation par colonnes est cohérente avec le principe de simplicité tant que le nombre de langues reste à deux.

**Alternatives.** Table de traductions générique (écartée — complexité non justifiée pour deux langues). Préfixe systématique y compris pour le FR (écarté, la mise à jour conserve le FR à la racine).

**Conséquences.** Une migration serait nécessaire si une troisième langue était ajoutée un jour — hypothèse figée, documentée comme telle. L'éditeur doit toujours indiquer la langue en cours d'édition (voir `docs/VISUAL_EDITOR_SPEC.md`).
