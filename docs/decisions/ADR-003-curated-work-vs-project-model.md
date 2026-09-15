# ADR-003 — Travail curaté vs modèle Projects

**Décision.** La page Travail est une vitrine éditoriale curatée construite à partir d'une sélection de médias (`work_items`), et non une accumulation de projets individuels avec pages dédiées. Les pages projet individuelles sont retirées du MVP. Flux : Médiathèque → Sélection de médias → Page Travail (remplace Projet → Galerie → Page projet).

**Contexte.** Le Master Brief original (sections 14-15, 40-41) définissait Travail autour d'un modèle Projects (projet → galerie → page projet dédiée). La mise à jour du 15 septembre 2026 remplace explicitement ce modèle.

**Pourquoi.** La page Travail doit démontrer le style et la qualité du regard de Divine Motion, pas construire une archive publique de projets. Elle doit rester la page la plus minimaliste du site, sans accumulation de titres/fiches individuelles.

**Alternatives.** Conserver le modèle Projects avec pages individuelles (écarté par la mise à jour). Une fonctionnalité « Stories / Histoires » narrative pour des mariages/événements exceptionnels a été envisagée mais placée explicitement hors scope MVP, à réévaluer plus tard sans contrainte du modèle `work_items` actuel.

**Conséquences.**
- Le module CMS « Projets » disparaît comme nœud principal (voir `docs/CMS_SPEC.md`).
- Pas de route publique `/travail/[slug]` au MVP (voir `docs/INFORMATION_ARCHITECTURE.md`).
- Simplifie l'éditeur visuel : un seul module de curation plutôt qu'un CRUD projet + galerie imbriquée.
- Le garde-fou « autorisation de publication » (section 21 du Master Brief original) doit être reporté sur `work_items` (et `testimonials`) — **point non tranché** dans la mise à jour, à valider en Phase 4 (voir `docs/CMS_SPEC.md`).
- Toute documentation antérieure faisant de « Projects » le cœur du MVP est superseded par cet ADR ; voir la note de mise à jour en tête de `docs/MASTER_BRIEF.md` et `docs/ONBOARDING_REVIEW.md`.
