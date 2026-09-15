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

## D1 invariants (Implementation Brief 010)

Suite dédiée (`tests/db/invariants.test.mjs`, exécutée via `npm run db:test`) contre un D1 local réel géré par Wrangler — pas un fichier SQLite nu ni une base en mémoire jetable. Couvre :

- **Schema applies** — `migrations/0001_initial.sql` crée exactement les tables/triggers attendus ; `contact_submission_log` absent (ADR-015) ; `services.layout` absent (ADR-014).
- **Foreign keys** — `PRAGMA foreign_keys` actif par défaut sur D1 (vérifié, pas supposé) ; `RESTRICT` bloque la suppression d'un `media` référencé ; `SET NULL` fonctionne pour `page_seo.og_media_id`.
- **Draft/publish uniforme (ADR-013)** — un seul brouillon par ligne publiée (`work_items`, `services`, contenu de page) ; **isolation publique** : modifier un `work_item` publié via son brouillon ne change jamais la lecture `status='published'` avant une action de publication explicite ; la transition de publication (copie brouillon → publié, suppression du brouillon) est testée de bout en bout ; `services.slug` reste unique parmi les lignes publiées uniquement.
- **FR/EN** — publication FR indépendante d'EN sur une même ligne (`work_items`), aucune langue n'écrase l'autre.
- **Droits de publication (ADR-011)** — les 4 triggers d'origine bloquent la publication (FR et EN, `work_items` et `testimonials`) tant que `media.publication_rights_confirmed = 0`, l'autorisent une fois confirmé ; un témoignage sans photo publie sans garde-fou.
- **Droits de publication — remplacement de média sur une ligne déjà live (`migrations/0002`, CMS Work Patch 013A)** — les 2 triggers `trg_*_rights_gate_media_change` (`work_items.media_id`, `testimonials.photo_media_id`) bloquent un changement de média direct en SQL sur une ligne `status='published'` dont FR ou EN est déjà `published`, tant que le nouveau média n'a pas ses droits confirmés ; le même changement reste autorisé quand aucune langue n'est live ; autorisé une fois les droits confirmés ; `photo_media_id` mis à `NULL` reste toujours autorisé ; et surtout, ce garde-fou ne bloque **jamais** l'édition d'un brouillon (`status='draft'`), même quand ce brouillon porte une copie obsolète d'un `fr_status`/`en_status` `published` hérité de son parent au moment de sa création.
- **Soft delete** — `media`/`testimonials.deleted_at` réglable et remettable à `NULL` ; `work_items` n'a délibérément pas de `deleted_at`.
- **CHECK constraints** — valeurs hors bornes/énumération rejetées (`focal_x`, `processing_status`, `media_type`, `status`, `site_settings.id`, `page_seo.page_key`).

Exécutée en CI après le build (`.github/workflows/ci.yml`), indépendamment de la suite frontend (`npm test`, qui reste scopée à `tests/routes.test.mjs`).

## Data Access Layer (Implementation Brief 011)

Suite dédiée (`tests/dal/dal.test.ts`, exécutée via `npm run db:test:dal`, incluse dans `npm run db:test`) contre un D1 local réel obtenu via l'API Node de Miniflare (même mécanisme que `wrangler d1 execute` en interne) — appelle directement les fonctions TypeScript de `src/lib/db/`, pas de contournement HTTP/CLI. Seedée une fois (`seeds/local.sql`) puis partagée entre les blocs de test. Couvre, en plus de la régression complète de la suite `tests/db/` (Brief 010, toujours au vert) :

- **Lectures publiques** — `listPublishedServices`/`listPublishedWorkItems`/`listPublishedTestimonials`/`homeContent.getPublished`/`getSiteSettings`/`getPageSeo`, filtrage correct (langue, visibilité, actif).
- **Isolation brouillon → publication** — testé explicitement de bout en bout sur `work_items` : modifier un brouillon ne change jamais la lecture publique ; publier copie exactement ce qui a été édité ; le brouillon est supprimé après publication.
- **`DRAFT_ALREADY_EXISTS`** et **`NO_DRAFT`** — erreurs métier renvoyées proprement (`Result`), jamais une exception SQL brute qui remonte à l'appelant.
- **Création + publication d'un contenu neuf** (jamais publié avant) — promotion en place, aucun instantané créé (rien à restaurer).
- **Snapshots** — un instantané est bien créé avant chaque publication d'un contenu déjà publié, capture l'état PRÉ-publication ; 6 publications consécutives laissent exactement 5 instantanés (élagage vérifié, pas supposé).
- **Droits de publication côté application** — `setWorkItemLanguageStatus`/`setTestimonialLanguageStatus` renvoient `PUBLICATION_RIGHTS_REQUIRED` *avant* toute requête SQL quand le média n'a pas ses droits confirmés ; la publication réussit une fois confirmés ; FR et EN restent indépendants.
- **Droits de publication — remplacement de média sur une ligne déjà live (CMS Work Patch 013A)** — `publishWorkItem` refuse (`PUBLICATION_RIGHTS_REQUIRED`, avant toute écriture, ligne publiée inchangée, brouillon conservé) un brouillon dont le média n'a pas ses droits confirmés lorsqu'il remplace une ligne déjà `published` en FR ou EN ; la publication réussit une fois les droits confirmés sur ce même brouillon ; en régression, un brouillon remplaçant une ligne publiée dont aucune langue n'est live reste publiable sans droits confirmés.
- **Isolation des tables enfants** — `service_features` (Services) et les deux enfants d'À propos (`about_story_paragraphs`, `about_approach_items`) simultanément : éditer les enfants d'un brouillon ne touche jamais les enfants de la ligne publiée avant publication.
- **Réordonnancement** (`reorderWorkItemDrafts`, Review 011A) — n'écrit jamais que sur des brouillons ; un id invalide dans la liste rejette l'ensemble sans créer/modifier aucun brouillon ; l'ordre public reste inchangé jusqu'à une publication explicite par item, testé de bout en bout (ordre public A/B/C → réordre les brouillons → lecture publique toujours A/B/C → après publication explicite, nouvel ordre visible).
- **Media** — `getMediaUsage` reflète les références réelles ; soft delete/restore ; `softDeleteMedia` refuse (`MEDIA_IN_USE`, aucune donnée modifiée) tant qu'une référence existe (Review 011A).
- **Settings/SEO** — mise à jour partielle (seuls les champs fournis changent), indépendance entre pages.

## Admin Security Foundation (Implementation Brief 012)

- **`tests/auth/access.test.ts`** (`npm run test:auth`) — les 7 scénarios requis par le brief contre un JWKS local signé pour le test (pas de réseau, pas de Cloudflare réel) : JWT absent → refus ; malformé → refus ; mauvais issuer → refus ; mauvais audience → refus ; expiré → refus ; signature invalide (même `kid`, mauvaise clé) → refus ; valide → identité retournée. Plus des cas limites : claim `email` absent, config manquante (échec fermé), extraction stricte du seul en-tête `Cf-Access-Jwt-Assertion`.
- **`tests/dal/dal.test.ts`**, suite « admin dashboard summary » (incluse dans `npm run db:test:dal`) — `getAdminDashboardSummary` contre un vrai D1 local : chaque champ cross-vérifié par une requête SQL indépendante, plus une preuve que le compte change bien quand la donnée sous-jacente change (lecture réelle, pas figée).
- **`tests/admin/routes.test.mjs`** (`npm run test:admin`) — preuve HTTP de bout en bout contre un vrai `astro build && astro preview` (mode production) : route publique non affectée ; `/admin` sans JWT → 401/403, aucune donnée admin ni détail interne dans la réponse, `Cache-Control: no-store`/`X-Robots-Tag: noindex, nofollow`/`X-Frame-Options: DENY` ; JWT malformé → toujours refusé ; les 8 routes placeholder protégées de la même façon. **Limite assumée** : ne couvre pas le chemin positif « JWT Access réel → Dashboard » en HTTP (nécessiterait une vraie application Cloudflare Access, hors scope) — ce chemin est prouvé par composition des deux suites précédentes. Voir `docs/ADMIN_SECURITY.md`.

## CMS Travail (Implementation Brief 013)

- **`tests/auth/mutation.test.ts`** (inclus dans `npm run test:auth`) — les 6 scénarios requis pour `requireAdminMutation`/`isSameOriginRequest` : GET sur une route de mutation → refus ; POST sans identité admin → refus ; POST avec un `Origin` différent → refus ; `Origin` absent → refus (échec fermé) ; POST same-origin avec identité valide → autorisé ; PUT/PATCH/DELETE acceptés comme POST. Pur, aucun D1/HTTP — voir `docs/decisions/ADR-016-admin-mutation-security.md` pour la décision testée.
- **`tests/admin/work-validation.test.ts`** (`npm run test:cms:work`) — `parseWorkItemForm` : formulaire valide accepté ; catégorie vide → `null` ; cases à cocher décochées → `false` ; champs focaux vides → 50 par défaut ; puis tous les rejets serveur indépendants du HTML — `mediaId` absent/non entier/≤0, catégorie inconnue, position non entière positive, ratio malformé, alt FR/EN manquant, focal hors 0-100, plusieurs erreurs simultanées rapportées ensemble.
- **`tests/admin/work-endpoints.test.ts`** (`npm run test:cms:work`) — les fonctions réelles de `src/lib/admin/work-actions.ts` (celles que les endpoints Astro appellent) contre un vrai D1 local isolé (même harnais Miniflare que `tests/dal/dal.test.ts`) :
  - **Cycle complet** — créer un brouillon → l'enregistrer → le publier (promotion en place, aucun instantané) ;
  - **Édition d'un item déjà publié** — `save` crée automatiquement le brouillon manquant ; la ligne publique reste inchangée jusqu'à `publish` ; un instantané PRÉ-publication est créé ; le brouillon disparaît après publication ;
  - **Suppression de brouillon** — jamais la ligne publiée ;
  - **FR/EN** — droits de publication non confirmés → refus avec message clair (pas de SQL brut) ; droits confirmés → FR publiable, EN reste indépendant, puis EN publiable sans dépublier FR ; locale/statut invalides rejetés avant tout accès DAL ;
  - **Réordonnancement** — l'action ne change jamais les positions publiques (isolation vérifiée), payload `orderedIds` malformé rejeté proprement ;
  - **Sélecteur de médias** — médias supprimés/`failed`/`pending` exclus, `ready` inclus ; `createWorkItemAction` refuse lui-même un `mediaId` non utilisable même si le client contourne le sélecteur (défense en profondeur, pas seulement une UI qui cache l'option) ;
  - **Validation** — un formulaire invalide n'appelle jamais la DAL ; un `id` inexistant renvoie un sentinel 404 propre.
  
  `preview.astro` n'est pas couvert ici (page Astro, pas une fonction important à isoler) — vérifié manuellement contre une session `astro dev` réelle (voir IMPLEMENTATION REPORT 013), sur les mêmes lectures (`getWorkItemDraft`/`getWorkItem`) que cette suite exerce déjà.
- **`tests/admin/routes.test.mjs`** (`npm run test:admin`, étendu en Brief 013) — deux tests supplémentaires contre le vrai `astro build && astro preview` : une mutation (`POST /admin/work/create`) sans JWT est bloquée avant toute logique métier ; un `Origin` same-origin valide ne suffit jamais à contourner l'authentification.

## Retiré du plan de test

Tout scénario de « page projet individuelle publique » (fiche projet dédiée) est retiré — hors scope MVP (voir `docs/decisions/ADR-003-curated-work-vs-project-model.md`).

## Accessibilité automatisée — à ajouter avant la QA finale WCAG 2.2 AA

La vérification d'accessibilité de la fondation frontend (Implementation Brief 001) a été faite manuellement : clavier, focus, `lang`, structure sémantique, contraste calculé sur la palette (voir `docs/ACCESSIBILITY.md`). Aucun outillage automatisé n'a été installé à ce stade pour ne pas élargir un petit lot de correctifs.

**À faire avant la QA finale (Phase 7)** : ajouter un contrôle accessibilité automatisé à la couche E2E, avec [axe-core](https://github.com/dequelabs/axe-core) piloté par Playwright (`@axe-core/playwright`), exécuté sur chaque page publique (FR et EN) et sur les états interactifs clés (panneau de navigation mobile ouvert, formulaire de contact avec erreurs de validation). Ce contrôle vient en complément des vérifications manuelles, pas à leur place — axe ne détecte pas tout (ex. : pertinence réelle d'un texte alternatif, ordre de tabulation logique au-delà d'un piège de focus basique).
