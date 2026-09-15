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
