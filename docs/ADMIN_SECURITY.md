# Admin Security — Divine Motion V2 (Implementation Briefs 012-013)

Documente le socle sécurisé de l'espace admin : comment `admin.divinemotion.ca` est protégé (Brief 012), comment le vérifier localement, et comment les mutations (Brief 013, CMS Travail) sont sécurisées au-delà de la lecture.

## Architecture

```text
Browser
  ↓
admin.divinemotion.ca
  ↓
Cloudflare Access (décide qui peut entrer)
  ↓
JWT Access (Cf-Access-Jwt-Assertion)
  ↓
Astro/Worker — src/middleware.ts (intercepte /admin/**)
  ↓
requireAdmin() — src/lib/auth/guard.ts
  ↓
verifyAccessJwt() — src/lib/auth/access.ts (signature + issuer + audience + expiration, contre le JWKS Cloudflare)
  ↓
admin route (src/pages/admin/*.astro, prerender = false)
  ↓
DAL (src/lib/db/*)
  ↓
D1
```

**Principe non négociable (ADR-008)** : Cloudflare Access devant l'admin ne suffit pas seul. Le runtime applicatif vérifie cryptographiquement le JWT — jamais de confiance dans `Cf-Access-Authenticated-User-Email`, un header `X-Admin`, une query param ou un cookie maison. Le seul en-tête lu est `Cf-Access-Jwt-Assertion`, et seulement après vérification complète (signature + `iss` + `aud` + `exp`) contre le JWKS Cloudflare (`https://<team-domain>/cdn-cgi/access/certs`), jamais une clé statique.

## Fichiers

- `src/lib/auth/access.ts` — le cœur cryptographique, pur (aucun accès à `cloudflare:workers`) : `verifyAccessJwt(jwt, config)` prend `teamDomain`/`audience`/`jwks` en paramètres explicites, exactement comme la DAL prend `db: D1Database` en premier paramètre. C'est ce qui le rend testable sous `node --test` (`tests/auth/access.test.ts`) sans runtime Workers ni réseau.
- `src/lib/auth/env.ts` — le seul fichier qui lit `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` via `cloudflare:workers` (même pattern que `src/lib/db/client.ts`). Retourne `null` si absent ou encore un placeholder committé — échec fermé, jamais une valeur par défaut.
- `src/lib/auth/guard.ts` — `requireAdmin(request)`, le point d'entrée unique utilisé par le middleware. Compose `access.ts` + `env.ts`, plus le bypass DEV strict (voir plus bas).
- `src/middleware.ts` — intercepte toute requête `/admin/**` avant qu'une page ne s'exécute ; renvoie 401 (JWT absent) ou 403 (JWT invalide/config absente) sans donnée admin, avec `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin` sur **toute** réponse `/admin`, succès ou échec.
- `src/lib/db/admin.ts` — `getAdminDashboardSummary(db)`, la seule lecture D1 du Dashboard, via la DAL existante (aucun SQL brut dans un composant `.astro`).
- `src/lib/auth/mutation.ts` (Brief 013) — `requireAdminMutation(request, locals)`, le point d'entrée unique pour toute route `POST` sous `/admin`. Voir "Mutation security" ci-dessous et ADR-016.
- `src/lib/admin/work-actions.ts` (Brief 013) — la logique métier des mutations CMS Travail, `db`-injectable, appelée par les endpoints minces sous `src/pages/admin/work/`.

## Cloudflare Access — configuration réelle (à faire par la personne détenant l'accès Cloudflare)

Cette session n'a provisionné aucune application Access réelle (hors scope, voir §43 du brief). Procédure pour staging/production :

1. Dans Cloudflare Zero Trust → Access → Applications, créer une application « Self-hosted » pour le hostname admin (`admin.divinemotion.ca` en production, l'équivalent staging pour staging).
2. Définir une policy (qui peut entrer — ex. emails de l'équipe Divine Motion). C'est Cloudflare Access qui décide qui entre (Brief 012 §12) ; l'application ne fait que vérifier que le JWT résultant est valide.
3. Noter le **Team Domain** (ex. `divinemotion.cloudflareaccess.com`) et l'**Audience (AUD) tag** de l'application créée.
4. Définir ces deux valeurs comme variables d'environnement du Worker pour cet environnement :
   - Local : `[vars]` dans `wrangler.toml` (déjà présent avec des placeholders explicites `REPLACE_WITH_...` — voir le fichier).
   - Staging : `[env.staging.vars]` dans `wrangler.toml`, ou variable d'environnement CI/secret au déploiement.
   - Production : jamais dans ce dépôt — variable d'environnement/secret Cloudflare au déploiement, comme le `database_id` D1 de production (voir `docs/DEPLOYMENT.md`).
5. Aucune de ces deux valeurs n'est un secret au sens strict de Cloudflare (elles voyagent dans le JWT lui-même), mais elles ne sont jamais des valeurs réelles committées dans ce dépôt — voir le commentaire dans `wrangler.toml`.

**Tant que ces valeurs restent des placeholders (`REPLACE_WITH_...`)**, `getAccessConfig()` renvoie `null` et toute requête `/admin` en mode production échoue fermée (`CONFIG_MISSING` → 403) — jamais un accès par défaut.

## Développement local

Le seul bypass de ce projet : `src/lib/auth/guard.ts` court-circuite `verifyAccessJwt` avec une identité factice **uniquement** quand `import.meta.env.DEV` est vrai.

- `import.meta.env.DEV` est injecté statiquement par Vite/Astro à la compilation : `true` sous `astro dev`, littéralement `false` — et donc éliminé du bundle — dans tout `astro build`. Même précédent que `src/pages/dev-d1-smoke-test.json.ts` (Brief 011, voir `docs/TECHNICAL_ARCHITECTURE.md`).
- Il n'existe aucune variable d'environnement, en-tête ou config qui puisse rouvrir ce bypass dans un Worker déployé — ce n'est pas une condition runtime contournable, c'est du code absent du bundle de production.
- `tests/admin/routes.test.mjs` le prouve empiriquement contre un vrai `astro build && astro preview` (mode production) : une requête `/admin` sans JWT y est bloquée (401/403), jamais un accès local silencieux.

## Mutation security (Implementation Brief 013)

CMS Travail introduit les premières routes de mutation (`POST /admin/work/*`). Chacune appelle `requireAdminMutation(request, locals)` (`src/lib/auth/mutation.ts`) avant de toucher la DAL — the single helper every endpoint uses, jamais une vérification réimplémentée par route (Brief 013 §37). Il compose :

1. **Méthode** — seules POST/PUT/PATCH/DELETE sont acceptées ; une mutation n'est jamais atteignable en GET.
2. **Identité admin** — `locals.adminIdentity`, déjà posée par `src/middleware.ts` avant que cette fonction ne s'exécute (défense en profondeur, pas la barrière principale — le middleware bloque déjà tout `/admin/**` sans JWT valide, mutations comprises).
3. **Origin** — voir `docs/decisions/ADR-016-admin-mutation-security.md` pour la décision complète (Option A : `Origin` strict, pas de token CSRF) et son raisonnement.

Chaque endpoint (`src/pages/admin/work/**/*.ts`) délègue sa logique métier à une fonction `xxxAction(db, ...)` dans `src/lib/admin/work-actions.ts`, qui prend `db: D1Database` en paramètre explicite (même convention que `src/lib/db/*`) — c'est ce qui la rend testable sous `node --test` sans runtime Workers (voir Tests ci-dessous), le fichier endpoint lui-même restant le seul point qui appelle `getDb()`/`cloudflare:workers` et n'est donc testable qu'au travers d'un vrai Worker (`tests/admin/routes.test.mjs`).

### Médiathèque (Implementation Brief 014)

Les 5 routes de mutation de `/admin/media/**` (`authorize`, `upload-complete`, `save`, `delete`, `restore`) appellent exactement le même `requireAdminMutation` — aucune logique de sécurité réimplémentée. Deux d'entre elles (`authorize`, `upload-complete`) renvoient du JSON typé plutôt qu'une redirection (ce sont les endpoints que le module d'upload client appelle), mais passent par la même porte d'entrée avant toute logique métier. `GET /admin/media/:id/file` (aperçu admin de l'objet R2) n'est pas une mutation — elle reste protégée par `src/middleware.ts` comme toute route `/admin/**`, sans vérification supplémentaire.

**IDOR.** Chaque route `:id` (`upload-complete`, `save`, `delete`, `restore`, `file`) vérifie l'existence réelle de la ligne média avant d'agir — jamais de confiance dans un id fourni par le client. Voir `src/lib/admin/media-actions.ts` (describe "IDOR" dans `tests/admin/media-actions.test.ts`).

**Secrets R2.** Les identifiants S3 réels (`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`) ne sont jamais dans `wrangler.toml`, jamais exposés au navigateur — voir `docs/DEPLOYMENT.md` "R2 credentials". `src/lib/storage/r2-presign.ts` ne fait que signer une URL côté serveur ; le navigateur ne reçoit que l'URL finale, jamais les identifiants.

## Logging (Brief 012 §33 / Brief 013 §28)

Le seul point de journalisation ajouté par le Brief 012 (`src/pages/admin/index.astro`, erreur D1) logue au maximum `err.message` — jamais le JWT, ses claims, ou des données personnelles au-delà de ce message d'erreur générique. `src/middleware.ts` ne logue rien du tout sur un refus (le corps de réponse générique suffit). Le Brief 013 n'ajoute aucun audit log complet — les colonnes `updated_by` déjà existantes dans le schéma (remplies avec l'email de l'identité admin sur chaque mutation) suffisent pour ce MVP, conformément à sa consigne §28.

## Tests

- `tests/auth/access.test.ts` — les 7 scénarios requis (JWT absent/malformé/mauvais issuer/mauvais audience/expiré/signature invalide/valide) plus des cas limites, contre un JWKS local généré pour le test (pas de dépendance réseau).
- `tests/auth/mutation.test.ts` (Brief 013) — les 6 scénarios requis pour `requireAdminMutation`/`isSameOriginRequest` : GET sur une route de mutation, POST sans identité, POST avec un `Origin` différent, `Origin` absent, POST same-origin valide, méthodes PUT/PATCH/DELETE acceptées. Pur, aucun D1/HTTP.
- `tests/dal/dal.test.ts` (suite « admin dashboard summary ») — `getAdminDashboardSummary` contre un vrai D1 local (Miniflare), avec cross-vérification par requêtes SQL indépendantes.
- `tests/admin/work-validation.test.ts` (Brief 013) — validation serveur du formulaire Travail (`parseWorkItemForm`), indépendante des attributs HTML.
- `tests/admin/work-endpoints.test.ts` (Brief 013) — les fonctions réelles de `src/lib/admin/work-actions.ts` contre un vrai D1 local isolé (même harnais Miniflare que la suite DAL) : cycle create → save → publish, édition d'un item déjà publié (brouillon auto-créé, ligne publique inchangée, instantané), suppression de brouillon, indépendance FR/EN via l'action de langue, droits de publication, isolation du réordonnancement, filtrage du sélecteur de médias (ready uniquement).
- `tests/admin/routes.test.mjs` — preuve HTTP réelle (`astro build && astro preview`) que `/admin` et tous les placeholders sont bloqués sans JWT, avec les bons headers, sans fuite de donnée ; étendu en Brief 013 pour prouver qu'une route de mutation (`POST /admin/work/create`) est bloquée de la même façon, y compris avec un `Origin` same-origin valide (un `Origin` correct ne remplace jamais l'authentification). Étendu à nouveau en Brief 014 : les 5 routes de mutation `/admin/media/**` (`authorize`, `upload-complete`, `save`, `delete`, `restore`) et la route d'aperçu (`/admin/media/:id/file`) sont testées de la même façon. **Limite assumée et documentée** : ne teste PAS le chemin positif « JWT Access réel valide → mutation » de bout en bout en HTTP, faute d'application Access réelle provisionnée (hors scope, Brief 012 §43 / Brief 013 §47). Ce chemin positif est prouvé par composition : `access.ts` (JWT valide → identité) + `work-endpoints.test.ts`/`media-actions.test.ts` (la logique de mutation contre D1 réel) — chaque maillon est testé, seule la fusion en un unique appel HTTP ne l'est pas.
- `tests/admin/media-actions.test.ts` (Brief 014) — les fonctions réelles de `src/lib/admin/media-actions.ts` contre un vrai D1 + R2 local isolé (Miniflare) : cycle complet JPEG/PNG/24 Mpx, multi-upload avec échec partiel isolé, fichier corrompu, MIME/taille mensongers, upload abandonné, suppression bloquée si utilisé, IDOR.
- **Non couvert par cette suite (Validation Brief 014S)** : le chemin JWT Access réel de bout en bout (login navigateur → `Cf-Access-Jwt-Assertion` réel → `verifyAccessJwt()` → identité), le comportement CORS réel du bucket R2, et le trafic réseau réel (preuve que l'upload va bien directement au endpoint R2, jamais au Worker). Checklist manuelle pour ces trois points : `docs/STAGING_VALIDATION.md` §9/§22 — non exécutée depuis l'environnement Claude Code (pas d'accès réseau sortant vers Cloudflare), à exécuter par Boris.
