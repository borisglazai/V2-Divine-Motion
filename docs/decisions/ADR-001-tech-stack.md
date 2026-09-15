# ADR-001 — Stack technique

**Décision.** Astro + TypeScript + Cloudflare (Workers, D1, R2, Images, Access, Turnstile, Web Analytics) + GitHub. Confirmée le 15 septembre 2026.

**Contexte.** Divine Motion V2 est une reconstruction complète (codebase neuve) d'un site majoritairement éditorial/photographique, avec un CMS et un éditeur visuel borné. L'ancien projet (`Site-Internet-DM`) était en réalité une application Next.js/vinext hébergée via une plateforme tierce (« ChatGPT Sites »), pas sur l'architecture cible.

**Pourquoi.** Astro est optimisé pour un site contenu/SEO/performance avec JS minimal. Cloudflare (Workers/D1/R2/Images/Access/Turnstile/Web Analytics) forme un ensemble cohérent à un seul fournisseur, ce qui simplifie l'exploitation par rapport à une architecture multi-fournisseurs ou à une plateforme d'hébergement tierce.

**Alternatives.** Next.js/vinext sur la plateforme de l'ancien projet (écarté — dépendance d'hébergement non standard, modèle de confiance admin fragile, voir ADR-008). CMS headless tiers (écarté — cible « CMS simple, pas universel », couplage fort souhaité avec le design system, incompatible avec un CMS générique).

**Conséquences.** Lock-in Cloudflare assumé (voir aussi la discussion « long terme » dans `docs/ONBOARDING_REVIEW.md`) ; un seul fournisseur à opérer ; nécessite discipline sur les migrations D1 et la séparation staging/production (ADR-009). Toute proposition de changement structurant de cette stack doit être argumentée et validée avant application.
