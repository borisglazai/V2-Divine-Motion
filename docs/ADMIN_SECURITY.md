# Admin Security — Divine Motion V2 (Implementation Brief 012)

Documente le socle sécurisé de l'espace admin : comment `admin.divinemotion.ca` est protégé, comment le vérifier localement, et ce qui reste à faire avant le premier module CMS avec mutation (écriture).

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

## CSRF — stratégie prévue avant le premier Brief CRUD (Brief 012 §32)

Ce brief est en lecture seule (Dashboard + placeholders, aucune mutation). Aucun système CSRF complet n'est construit maintenant. Stratégie prévue pour le Brief qui introduira la première mutation (Travail, Médias, etc.) :

- **Cloudflare Access reste la première barrière** : une mutation nécessite un JWT Access valide, exactement comme une lecture — pas de route de mutation qui contournerait `requireAdmin`.
- **Vérification d'origine** : toute requête de mutation (POST/PATCH/DELETE) doit vérifier que l'en-tête `Origin` correspond au domaine admin attendu, rejetée sinon.
- **Same-site** : les futurs cookies/session (s'il y en a, au-delà du JWT Access lui-même qui est géré par Cloudflare) seront `SameSite=Strict`.
- **Pas de mutation via GET** : chaque action d'écriture est un verbe HTTP de mutation dédié, jamais un lien `GET` avec effet de bord.
- Ce point est à réexaminer et verrouiller (ADR si nécessaire) au moment du premier Brief CMS avec écriture — actuellement une intention documentée, pas un mécanisme implémenté.

## Logging (Brief 012 §33)

Le seul point de journalisation ajouté par ce brief (`src/pages/admin/index.astro`, erreur D1) logue au maximum `err.message` — jamais le JWT, ses claims, ou des données personnelles au-delà de ce message d'erreur générique. `src/middleware.ts` ne logue rien du tout sur un refus (le corps de réponse générique suffit ; voir §14 du brief — aucun détail exposé, ni au client ni dans les logs).

## Tests

- `tests/auth/access.test.ts` — les 7 scénarios requis (JWT absent/malformé/mauvais issuer/mauvais audience/expiré/signature invalide/valide) plus des cas limites, contre un JWKS local généré pour le test (pas de dépendance réseau).
- `tests/dal/dal.test.ts` (suite « admin dashboard summary ») — `getAdminDashboardSummary` contre un vrai D1 local (Miniflare), avec cross-vérification par requêtes SQL indépendantes.
- `tests/admin/routes.test.mjs` — preuve HTTP réelle (`astro build && astro preview`) que `/admin` et tous les placeholders sont bloqués sans JWT, avec les bons headers, sans fuite de donnée. **Limite assumée et documentée** : ne teste PAS le chemin positif « JWT Access réel valide → Dashboard » de bout en bout en HTTP, faute d'application Access réelle provisionnée (hors scope, §43). Ce chemin positif est prouvé par composition : `access.ts` (JWT valide → identité) + la suite Dashboard DAL (D1 réel) — chaque maillon est testé, seule la fusion en un unique appel HTTP ne l'est pas.
