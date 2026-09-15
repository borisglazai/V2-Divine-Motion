# ADR-010 — Pipeline CI minimale obligatoire

**Décision.** Chaque Pull Request exécute install → lint → typecheck → tests → build. Aucun merge n'est possible si un contrôle obligatoire échoue.

**Contexte.** Absent du Master Brief original ; identifié comme trou dans `docs/ONBOARDING_REVIEW.md` (section 9), puis acté explicitement dans la mise à jour du 15 septembre 2026 (section 31).

**Pourquoi.** Éviter les régressions découvertes seulement après merge ; cohérent avec le principe de « gestion par lots » (Master Brief section 80) plutôt qu'un cycle bug/deploy/bug/deploy.

**Alternatives.** Validation manuelle uniquement avant merge (écartée, non fiable dans la durée).

**Conséquences.** À mettre en place dès le début de la Phase 3 (premier code), via GitHub Actions, avant le premier Implementation Brief.
