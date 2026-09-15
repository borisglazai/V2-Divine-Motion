# Technical Architecture — Divine Motion V2

## Stack (confirmée, section 29 de la mise à jour du 15 septembre 2026)

Astro, TypeScript, Cloudflare Workers, D1, R2, Cloudflare Images, Cloudflare Access, Turnstile, Web Analytics, GitHub. Toute modification structurante doit être proposée avant application (ADR requis). Voir `docs/decisions/ADR-001-tech-stack.md`.

## Admin / Visual Editor dans Astro

Îlots Astro (composants interactifs `client:load`) partageant l'arbre de composants avec le site public, dans le même dépôt/Worker. Voir `docs/decisions/ADR-002-visual-editor-vs-page-builder.md` et `ADR-003-curated-work-vs-project-model.md`. Le changement de modèle Travail (curated `work_items` plutôt que Projects) simplifie même la surface de l'éditeur : un seul module de curation plutôt qu'un CRUD projet + galerie imbriquée.

## Découpage Workers

Un Worker principal pour le rendu Astro + API (CMS, contact, publication). Un Worker/Cron Trigger distinct et documenté pour la purge planifiée de la corbeille médias après la période de rétention (voir `docs/MEDIA_ARCHITECTURE.md`) — ce n'est pas une multiplication de backends inutile, c'est une tâche planifiée qui n'a pas de sens dans le cycle requête/réponse du Worker principal.

## Upload de médias

Flux d'upload direct vers R2 par URL présignée (voir `docs/decisions/ADR-006-direct-upload-r2-presigned.md`). Le Worker génère l'URL présignée et enregistre les métadonnées (D1) après confirmation de l'upload ; il ne reçoit jamais le binaire complet d'un fichier ~24 Mpx en proxy.

## Transformations d'images

R2 (master web) → Cloudflare Images (transformations à la demande) → CDN. **Décision encore ouverte** : Cloudflare Images (produit géré, coût par image stockée/livrée) vs Image Resizing (redimensionnement à la volée) sont deux produits Cloudflare distincts avec des modèles de coût différents — à trancher en Phase 4 (voir `docs/decisions/ADR-005-media-r2-cloudflare-images.md`).

## CI/CD

Pipeline minimale sur chaque Pull Request : install → lint → typecheck → build → tests. Aucun merge si un contrôle obligatoire échoue (voir `docs/decisions/ADR-010-ci-pipeline.md`). Déploiement preview recommandé pour QA visuelle avant fusion vers `staging`.

> **Écart assumé par rapport à l'ordre abstrait install/lint/typecheck/tests/build** : le test automatisé de routing (`tests/routes.test.mjs`) vérifie le contenu de `dist/client`, donc il doit s'exécuter après `build`, pas avant. L'ordre réel en CI est **install → lint → typecheck → build → test**. Documenté ici plutôt qu'appliqué silencieusement (section 78 du Master Brief).

## Environnements

Local, Staging (`staging.divinemotion.ca`), Production (`divinemotion.ca`, `admin.divinemotion.ca`). D1 et R2 isolés par environnement (voir `docs/decisions/ADR-009-environment-strategy.md`). Migrations D1 versionnées, jamais de modification manuelle du schéma. Configuration réelle : `wrangler.toml` (voir `docs/DEPLOYMENT.md`).

## D1 — fondation (Implementation Brief 010)

`migrations/0001_initial.sql` est la migration réelle et appliquée (localement, via Wrangler) du schéma conçu dans `docs/DATA_ARCHITECTURE.md`. Voir `docs/DATA_ARCHITECTURE.md` et `docs/DEPLOYMENT.md` pour le détail complet (environnements, seed, tests, sauvegarde).

## Data Access Layer (Implementation Brief 011)

`src/lib/db/` — SQL explicite au-dessus de `env.DB`, pas d'ORM. Voir `docs/DATA_ARCHITECTURE.md` "Data Access Layer" pour l'architecture complète (moteur brouillon/publié partagé, convention d'erreurs, transactions D1, enfants, snapshots). Le frontend public n'y est toujours pas branché — `src/data/mock/*.ts` reste la source utilisée par les pages.

**`cloudflare:workers` remplace `Astro.locals.runtime.env`.** Avec Astro 6 / `@astrojs/cloudflare` 14.x, `Astro.locals.runtime.env` a été retiré (confirmé en lisant `node_modules/@astrojs/cloudflare/dist/utils/cf-helpers.js`, qui lève explicitement une erreur avec ce message si on essaie). La seule API supportée est `import { env } from "cloudflare:workers"` — voir `src/lib/db/client.ts`, le seul fichier de ce dépôt qui y touche. Les types ambiants (`Env`, `D1Database`, le module `cloudflare:workers` lui-même) viennent de `worker-configuration.d.ts`, régénéré par `wrangler types` (câblé dans `npm run typecheck`), gitignored comme `.astro/types.d.ts` — jamais commité, jamais modifié à la main.

**`D1Database.batch()` est le seul mécanisme d'atomicité.** Confirmé contre le fichier de types généré (pas de `BEGIN`/`COMMIT`, pas de transaction interactive dans l'API publique) : `batch()` exécute un tableau fixe de requêtes préparées de façon atomique, mais aucune requête ne peut lire le résultat d'une requête précédente du même appel. `INSERT ... RETURNING id` fonctionne sur D1 local (confirmé) et sert à obtenir l'id auto-généré d'une ligne juste insérée, mais reste un aller-retour séparé — voir `docs/DATA_ARCHITECTURE.md` "Transactions D1" pour l'analyse complète (ce qui est atomique dans la DAL, ce qui ne l'est délibérément pas).

**`node --test` sur des fichiers `.ts` exige des imports avec extension explicite.** Le support natif de Node 22 pour exécuter du TypeScript (sans build) résout les imports relatifs à la lettre (`./types` échoue, `./types.ts` réussit) — incompatible avec la convention sans extension utilisée dans tout `src/`. `tsx` (nouvelle devDependency, utilisée uniquement par `db:test:dal`) résout les imports comme le ferait un bundler, sans qu'il faille changer le style d'import du code source lui-même.

**Fichiers `src/pages/` préfixés `_`/`__` sont exclus du routage par Astro**, pas seulement masqués — une première tentative de route de smoke-test nommée `__d1-smoke-test.json.ts` renvoyait le 404 générique d'Astro (aucune route ne correspondait), pas la réponse de mon propre handler. Renommé sans le préfixe underscore (`dev-d1-smoke-test.json.ts`), avec un garde-fou `import.meta.env.DEV` comme véritable protection contre l'exposition en production — vérifié dans les deux sens (accessible sous `astro dev`, 404 sous `astro build && astro preview`).

## Sécurité

Cloudflare Access devant `/admin`. Vérification réelle de la signature du JWT Access côté Worker — jamais de confiance dans un simple en-tête HTTP non signé (voir `docs/decisions/ADR-008-security-access-jwt.md`, et le contre-exemple documenté de l'ancien projet dans `docs/ONBOARDING_REVIEW.md` section 8).

## Admin Security Foundation + CMS Shell (Implementation Brief 012)

`src/middleware.ts` + `src/lib/auth/` implémentent la vérification décrite ci-dessus (voir `docs/ADMIN_SECURITY.md` pour l'architecture complète et la configuration Cloudflare Access réelle ; la sécurité des mutations, alors seulement prévue, est implémentée en Brief 013 — voir plus bas). Résumé technique :

- **`jose`** (nouvelle dépendance, ^6.2.12) fait la vérification JWT elle-même (`jwtVerify` contre un JWKS) — pas de crypto maison, pas de framework d'auth complet.
- **`src/lib/auth/access.ts` est pur** : `verifyAccessJwt(jwt, config)` reçoit `teamDomain`/`audience`/un getter JWKS optionnel en paramètres explicites, sans importer `cloudflare:workers` — même convention que la DAL (`db: D1Database` en premier paramètre partout). Ça permet de le tester sous `node --test` avec un JWKS local signé pour le test (`tests/auth/access.test.ts`), sans réseau ni runtime Workers.
- **`src/lib/auth/env.ts`** est le seul fichier de `src/lib/auth/` qui lit `env.CF_ACCESS_TEAM_DOMAIN`/`env.CF_ACCESS_AUD` via `cloudflare:workers` — même pattern que `src/lib/db/client.ts`.
- **`wrangler.toml` `[vars]`** porte `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` avec des placeholders `REPLACE_WITH_...` explicites (même traitement que le `database_id` D1) : tant qu'ils ne sont pas remplacés par de vraies valeurs, toute vérification échoue fermée (`CONFIG_MISSING`), jamais un accès par défaut.
- **Routes admin dynamiques, jamais prerenderées** : chaque page sous `src/pages/admin/` déclare `export const prerender = false` — une route admin doit s'exécuter à chaque requête (vérification JWT + lecture D1), contrairement aux pages publiques actuelles qui restent toutes `prerender = true`.
- **`astro preview` (mode production) force le fermé, pas d'exception locale** : vérifié empiriquement (`tests/admin/routes.test.mjs`) — un `astro build && astro preview` réel, avec les placeholders `CF_ACCESS_*` encore en place, rejette `/admin` sans JWT (401/403, `no-store`, `noindex`). Le bypass `import.meta.env.DEV` de `src/lib/auth/guard.ts` n'existe que sous `astro dev`.
- **`workerd` (le runtime réel que `@cloudflare/vite-plugin` fait tourner pour `astro preview`) ne se termine pas toujours avec son processus parent.** `tests/admin/routes.test.mjs` a d'abord tenté un simple `SIGTERM` puis un kill de groupe de processus (`detached: true` + `-pid`) — les deux laissaient parfois un `workerd` orphelin sur le port. Correctif : parcourir l'arbre `ps` (pid/ppid) à partir du process `astro preview` et tuer chaque descendant explicitement. Un `workerd` résiduel zombie (sans port ouvert) peut occasionnellement subsister malgré ça — sans impact sur la fiabilité des tests (le port est libéré), documenté plutôt que masqué.

## CMS Travail + Mutation Security (Implementation Brief 013)

- **`import { env } from "cloudflare:workers"` casse `node --test` même sous `tsx`, pas seulement au runtime.** Une première version de `tests/admin/work-endpoints.test.ts` importait directement les endpoints Astro (`src/pages/admin/work/*.ts`), qui importent `getDb()` de `src/lib/db/client.ts` — et donc transitivement `cloudflare:workers` — **au niveau module**, pas seulement à l'appel. Node échoue immédiatement à l'import (`ERR_UNSUPPORTED_ESM_URL_SCHEME`, le schéma `cloudflare:` n'étant reconnu par aucun loader ESM en dehors d'un runtime Workers/Miniflare réel), avant même que le test ne s'exécute — contrairement à `cloudflare:workers` *appelé* dans un test qui échouerait seulement à l'exécution, ici l'échec est au chargement du module. **Correctif, pas contournement** : la logique métier de chaque mutation (`src/lib/admin/work-actions.ts`) a été extraite dans un module qui prend `db: D1Database` en paramètre explicite — exactement la convention déjà utilisée par `src/lib/db/*` et `src/lib/auth/access.ts` — de sorte qu'il n'importe jamais `client.ts`. Les fichiers endpoints (`src/pages/admin/work/**/*.ts`) restent minces : vérification mutation, `getDb()`, délégation, `redirect()`. Résultat : `work-actions.ts` est testable sous `node --test` contre un vrai D1 (`tests/dal/harness.ts`), et seuls les endpoints eux-mêmes restent testables uniquement via un vrai Worker (`tests/admin/routes.test.mjs`) — cohérent avec le principe déjà établi pour `src/lib/db/client.ts`/`src/lib/auth/env.ts` : un seul point d'accès direct au binding, jamais mélangé à la logique testable.
- **Astro exécute chaque fichier de test en sous-processus par défaut (Node 22).** `node --test <fichier>` isole chaque fichier passé explicitement dans son propre processus enfant — pertinent pour le nettoyage défensif de `tests/admin/routes.test.mjs` (`killWhateverIsOnPort` exclut explicitement `process.pid`/`process.ppid` pour ne jamais se tuer lui-même par accident si un `lsof -i :PORT` capture transitoirement sa propre connexion sortante).

## Médiathèque + upload direct R2 (Implementation Brief 014)

- **Le binding `R2Bucket` natif (`env.MEDIA`) ne peut pas générer d'URL présignée.** Il n'expose que `put()/get()/head()/delete()`, tous server-side — utile pour la vérification post-upload et l'aperçu admin, inutile pour permettre au navigateur d'uploader directement. Une URL présignée utilisable par le navigateur exige l'API S3-compatible de R2, qui a sa propre surface d'identifiants (Account ID, Access Key ID, Secret Access Key) — distincte du binding Worker. Voir `docs/decisions/ADR-017-r2-direct-upload-lifecycle.md`.
- **`PRAGMA foreign_keys=OFF` est un no-op à l'intérieur d'une transaction déjà ouverte, confirmé empiriquement contre un vrai D1 local.** En investiguant l'option la plus simple pour la sémantique de `uploaded_at` (le rendre `NULL`able), la technique standard SQLite « recréer la table » (`DROP TABLE` + recréation) a été tentée et a échoué avec `SQLITE_CONSTRAINT_TRIGGER` sur `media`, référencée par des FK actives depuis six tables — même précédée d'un `PRAGMA foreign_keys=OFF;` dans le même appel `wrangler d1 execute`. Chaque appel `d1 execute`/fichier de migration s'exécute comme une seule transaction atomique (déjà établi ci-dessus pour `wrangler d1 execute --command`) ; le PRAGMA à l'intérieur d'une telle transaction ne prend simplement pas effet. Détail complet, avec les trois expériences isolées qui ont confirmé le diagnostic : ADR-017.
- **Miniflare expose R2 via la même API Node que D1.** `convertV4MiniflareOptions({ r2Buckets: { MEDIA: "..." } })` + `mf.getR2Bucket("MEDIA")`, symétrique à `d1Databases`/`getD1Database` déjà utilisé par `tests/dal/harness.ts` (Brief 011) — `tests/dal/harness.ts` expose désormais aussi `getTestBucket()`, réutilisant la même instance Miniflare. Permet de tester tout le cycle de vie serveur (authorize, vérification post-upload, échec) contre un vrai moteur R2 local, sans jamais toucher un bucket distant réel (Brief 014 §45).
- **Un upload direct navigateur→R2 ne peut pas être exercé de bout en bout en test local/CI.** L'URL présignée cible le vrai endpoint S3 de R2 (`https://<account>.r2.cloudflarestorage.com/...`), qui n'existe que pour un compte Cloudflare réel — hors de portée sans provisionnement distant (explicitement refusé dans ce brief). `tests/admin/media-actions.test.ts` simule la conséquence de ce PUT (écrire les octets directement dans le bucket Miniflare à la clé générée par `authorize`) puis exerce la vraie vérification serveur (`completeMediaUploadAction`) — ce qui teste réellement la moitié serveur du cycle, la seule que ce brief peut prouver sans compte Cloudflare réel. La génération de l'URL présignée elle-même (structure, host, bucket, paramètres SigV4, expiration) est testée séparément et précisément dans `tests/storage/r2-presign.test.ts`, sans réseau (`aws4fetch` n'a besoin que de SubtleCrypto pour signer).

## Notes d'implémentation — Frontend Foundations (Implementation Brief 001)

Décisions techniques réelles révélées par la première implémentation (section 31 du brief : à documenter, pas à garder implicite).

**Rendu et adaptateur.** `output: "server"` + `@astrojs/cloudflare`, avec `export const prerender = true` sur chaque page actuelle. Toutes les pages de cette phase sont donc statiques au build, mais le Worker est déployable tel quel dès que des routes dynamiques (contact, CMS) seront ajoutées en Phase 4/5 — aucune reconfiguration d'adaptateur à prévoir.

**Routing FR/EN : table manuelle, pas le routing i18n natif d'Astro.** Les slugs FR et EN diffèrent par page (`travail` vs `work`, `a-propos` vs `about`, `confidentialite` vs `privacy`). Le routing i18n intégré d'Astro suppose un slug partagé entre langues ; il ne convient donc pas ici. `src/i18n/routes.ts` est la source de vérité unique reliant identifiant de page ↔ chemin FR ↔ chemin EN, utilisée par le sélecteur de langue, le header, le footer et les balises hreflang/canonical. Toute nouvelle page doit être ajoutée à cette table.

**Polices : self-hosted via Fontsource, pas de lien Google Fonts.** `@fontsource/instrument-serif` (statique, un seul poids) et `@fontsource-variable/manrope` (fichier variable unique, tous les poids) — cohérent avec l'objectif « peu de poids inutiles » (section 11 du brief). Importés dans `src/styles/global.css`.

**Piège Cloudflare Workers — `Date` gelée au 1er janvier 1970 pour le code évalué hors requête.** Le runtime `workerd` (utilisé par l'adaptateur Cloudflare, y compris pendant le prerendering au build) fige `Date`/`Date.now()` à l'epoch pour tout code exécuté en dehors du traitement d'une requête réelle — notamment le code de portée module, évalué une seule fois à froid. Un premier essai calculait l'année du copyright du footer avec `new Date().getFullYear()` au niveau module de `src/i18n/ui.ts` : le HTML statique généré affichait « © 1970 » au lieu de l'année réelle. **Correctif appliqué** : l'année est désormais injectée à la vraie compilation (processus Node, hors `workerd`) via `vite.define.__BUILD_YEAR__` dans `astro.config.mjs`, et lue comme constante dans `ui.ts`. **Règle à retenir pour la suite du projet** : ne jamais calculer une valeur dépendante du temps réel (`Date`, `Math.random` non plus) au niveau module ou pendant le rendu d'une page — soit l'injecter depuis la configuration Vite/Node, soit la calculer réellement à l'intérieur d'un handler de requête dynamique (pas prerenderé).

**Piège de portée CSS Astro — un sélecteur scopé ne matche jamais une classe posée sur un composant enfant.** Le CSS scopé d'Astro applique un attribut de hachage uniquement aux éléments écrits littéralement dans le fichier `.astro` courant. Passer `class="foo"` à un composant enfant (`<Container class="foo">`, `<Text class="foo">`, etc.) puis écrire `.foo { … }` dans le `<style>` du parent ne fonctionne pas : la règle ne s'applique jamais, silencieusement (pas d'erreur de build). Six occurrences de ce bug ont été trouvées et corrigées pendant la QA visuelle de cette implémentation (`about__content`, `contact`, `about-preview__text`, `privacy`, `services__intro`, `work__intro`, plus `mobile-nav__lang`) en enveloppant le sélecteur avec `:global(...)`. **Convention à appliquer systématiquement** : toute classe passée en prop `class` à un composant enfant doit être stylée via `:global(.nom-de-classe)` dans le composant parent.

**Lint.** ESLint 9 (flat config) + `typescript-eslint` + `eslint-plugin-astro` (`flat/recommended`). Le préréglage `flat/jsx-a11y-recommended` du même plugin a été essayé puis retiré : il produisait une erreur de configuration liée à un pair-dépendance non résolu, pour un bénéfice marginal à ce stade (l'accessibilité de cette phase a été vérifiée manuellement — clavier, focus, `lang`, structure sémantique — voir `docs/ACCESSIBILITY.md`). À réévaluer si une revue automatisée d'accessibilité devient nécessaire.

## Notes d'implémentation — D1 Foundation (Implementation Brief 010)

**`PRAGMA foreign_keys` est activé par défaut sur D1**, contrairement à SQLite « nu » où chaque connexion doit l'activer explicitement. Vérifié empiriquement (pas supposé) : `PRAGMA foreign_keys;` retourne `1` immédiatement après connexion à une base D1 locale fraîchement migrée, et une tentative de suppression d'un `media` référencé par `work_items` échoue bien avec `FOREIGN KEY constraint failed`. Confirme le commentaire déjà présent dans `migrations/0001_initial.sql`.

**`wrangler d1 execute --json` écrit le message d'erreur sur STDOUT, pas STDERR.** Sur un `INSERT`/`UPDATE` qui viole une contrainte (`CHECK`, trigger `RAISE(ABORT)`), la commande sort avec un code non nul et imprime `{"error": {"text": "..."}}` sur stdout ; stderr ne contient que la bannière d'avertissement proxy (« Proxy environment variables detected »). Un premier essai de `tests/db/helpers.mjs` lisait uniquement `stderr` sur une commande en échec et obtenait donc un message vide — corrigé pour lire stdout en priorité. À retenir pour tout futur script qui parse la sortie de `wrangler d1 execute`.

**Chaque appel `wrangler d1 execute --command "stmt1; stmt2; ..."` est une transaction atomique.** Si un statement du batch échoue, tous les statements précédents du même appel sont annulés — y compris ceux qui auraient autrement réussi. `tests/db/invariants.test.mjs` sépare donc systématiquement la préparation (qui doit persister) de l'assertion d'échec (dans un appel séparé), plutôt que de les combiner dans un seul `--command`.

**Limite de termes dans un `SELECT` composé (`UNION ALL`) plus basse que la limite SQLite par défaut.** Une requête de vérification ad hoc avec 6 `UNION ALL` a échoué avec `too many terms in compound SELECT` sur D1 local — surprenant, la limite SQLite standard est bien plus haute (500). Contourné en interrogeant chaque table séparément. Sans impact sur le schéma ou les migrations (aucune vue/requête du schéma n'utilise `UNION`), mais à garder en tête pour toute requête d'agrégation multi-tables future (CMS, dashboard admin).

**`wrangler` est un vrai `devDependency` du projet** (`package.json`), pas seulement invoqué via `npx` à la volée — assure une version reproductible (`^4.131.2`) entre postes de développement et CI.

**`npm test` reste scopé au test frontend existant.** La découverte par défaut de `node --test` (sans argument) ramasse tout fichier `*.test.mjs` du dépôt, y compris `tests/db/invariants.test.mjs` — ce qui aurait silencieusement fait dépendre `npm test` de Wrangler/D1 et ajouté ~220s à chaque exécution. `package.json` cible donc explicitement `tests/routes.test.mjs` pour `npm test`, et `tests/db/invariants.test.mjs` a son propre script `db:test`.
