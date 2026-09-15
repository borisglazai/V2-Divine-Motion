# Test Plan — Divine Motion V2

## Parcours critiques (mis à jour, Travail remplace Projects)

1. Frontière admin/Access — aucun accès à `/api/admin/*` ni à l'éditeur sans JWT Access valide et vérifié.
2. Curation Travail — ajouter/retirer un média, réordonner (le nouvel ordre persiste après reload), catégoriser, alt/légendes FR/EN indépendants, point focal appliqué visuellement.
3. Publication indépendante par langue — un brouillon EN incomplet n'empêche pas la publication FR, et n'est jamais publié tant qu'il est incomplet.
4. Upload haute résolution (~24 Mpx) via flux présigné, y compris erreurs réseau et retry.
5. Protection anti-suppression d'un média utilisé (Travail, Services, Témoignages, Contenu).
6. Formulaire de contact — Turnstile, validation serveur, envoi email, détection d'échec silencieux.
7. Routing i18n — redirection de langue par défaut, hreflang, canonical, sitemap multilingue, `/confidentialite` / `/en/privacy`.
8. Persistance complète (upload → ajout à Travail → reload → logout/login → vérifier).
9. CI — un Pull Request avec lint/typecheck/test/build en échec ne doit pas pouvoir être fusionné.

## Retiré du plan de test

Tout scénario de « page projet individuelle publique » (fiche projet dédiée) est retiré — hors scope MVP (voir `docs/decisions/ADR-003-curated-work-vs-project-model.md`).
