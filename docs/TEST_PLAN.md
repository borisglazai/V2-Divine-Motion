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

## Accessibilité automatisée — à ajouter avant la QA finale WCAG 2.2 AA

La vérification d'accessibilité de la fondation frontend (Implementation Brief 001) a été faite manuellement : clavier, focus, `lang`, structure sémantique, contraste calculé sur la palette (voir `docs/ACCESSIBILITY.md`). Aucun outillage automatisé n'a été installé à ce stade pour ne pas élargir un petit lot de correctifs.

**À faire avant la QA finale (Phase 7)** : ajouter un contrôle accessibilité automatisé à la couche E2E, avec [axe-core](https://github.com/dequelabs/axe-core) piloté par Playwright (`@axe-core/playwright`), exécuté sur chaque page publique (FR et EN) et sur les états interactifs clés (panneau de navigation mobile ouvert, formulaire de contact avec erreurs de validation). Ce contrôle vient en complément des vérifications manuelles, pas à leur place — axe ne détecte pas tout (ex. : pertinence réelle d'un texte alternatif, ordre de tabulation logique au-delà d'un piège de focus basique).
