# Deployment — Divine Motion V2

**Statut :** fondation D1 (Implementation Brief 010) + socle admin/Cloudflare Access (Implementation Brief 012). Ce document couvre la persistance (D1/migrations) et la configuration Cloudflare Access qui en découlent. Le déploiement applicatif complet (Worker, R2, Cloudflare Images, Turnstile, email transactionnel) n'est pas encore construit — voir `docs/ROADMAP.md` pour le séquencement des phases.

## Environnements

```text
local        — développement, sur ce dépôt, base D1 locale (Wrangler/Miniflare)
staging      — staging.divinemotion.ca (infrastructure réelle, pas encore provisionnée)
production   — divinemotion.ca / admin.divinemotion.ca (jamais touché par cette session)
```

`D1 staging != D1 production` (ADR-009) : bases strictement séparées, jamais fusionnées, jamais de script qui écrit dans les deux.

## D1 — configuration (`wrangler.toml`)

Le binding `DB` est déclaré dans `wrangler.toml` à la racine du dépôt.

- **Local** — `database_id = "00000000-0000-0000-0000-000000000000"` : placeholder, pas une ressource Cloudflare réelle. Il sert uniquement de clé pour l'émulation locale Miniflare (`.wrangler/state/`) ; aucun `wrangler d1 create` n'a été exécuté contre un vrai compte Cloudflare.
- **Staging** — `[env.staging]` déclaré mais **non provisionné**. `database_id = "REPLACE_WITH_REAL_STAGING_D1_DATABASE_ID"` est un placeholder littéral à remplacer manuellement (voir procédure ci-dessous). Aucune migration n'a été appliquée à un staging distant depuis cette session.
- **Production** — délibérément absente de `wrangler.toml`. Aucun binding, aucun `database_id`, réel ou inventé.

### Provisionner D1 staging (procédure manuelle, à exécuter par la personne détenant l'accès Cloudflare)

```bash
npx wrangler d1 create divine-motion-v2-staging
# Copier le database_id retourné dans wrangler.toml, section [env.staging.d1_databases]
npm run db:migrate:staging   # applique migrations/ à ce D1 staging distant
```

**Important** — cette session (Brief 010) n'a exécuté aucune de ces commandes : ni `wrangler d1 create`, ni une migration `--remote`. Le scope du brief interdit explicitement de créer/modifier une ressource D1 distante sans validation explicite de Boris. `npm run db:migrate:staging` existe comme commande documentée, prête à l'emploi une fois staging provisionné — elle n'a jamais été lancée depuis cette session.

## Migrations — immuabilité

Une fois une migration appliquée à un environnement (y compris local), le fichier devient immuable : ne jamais modifier `migrations/0001_initial.sql` rétroactivement. Toute évolution du schéma est une nouvelle migration (`migrations/0002_....sql`, etc.), numérotée séquentiellement, versionnée dans Git. Voir `docs/DATA_ARCHITECTURE.md` "Migration strategy".

### Migration défectueuse en production — philosophie

Ne jamais corriger `0001_initial.sql` après application. En cas de problème détecté après une migration :
1. **Sauvegarder d'abord** (voir `docs/BACKUP_RECOVERY.md`).
2. **Forward-fix** : écrire une nouvelle migration corrective (`000N_fix-....sql`) plutôt que de modifier l'historique.
3. Une migration inverse (rollback SQL explicite) n'est envisagée que lorsqu'elle est sûre à 100 % (aucune perte de données déjà écrites par de vrais utilisateurs) — dans le doute, préférer restaurer depuis une sauvegarde puis rejouer les migrations forward-fix.

## Commandes disponibles

```bash
npm run db:migrate:local     # applique migrations/ à D1 local (Wrangler/Miniflare)
npm run db:migrate:staging   # applique migrations/ à D1 staging distant — JAMAIS lancé sans validation explicite de Boris
npm run db:seed:local        # seed non destructif (seeds/local.sql) — à lancer une fois, sur une base fraîchement migrée
npm run db:test              # suite d'invariants contre un D1 local isolé (.wrangler-test/, séparé de la base de dev)
```

## Cloudflare Access — configuration (`wrangler.toml`, Implementation Brief 012)

`CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` sont déclarées en `[vars]` (local) et `[env.staging.vars]` (staging), avec des placeholders `REPLACE_WITH_...` explicites — aucune application Cloudflare Access réelle n'a été provisionnée par cette session. Procédure complète de configuration : `docs/ADMIN_SECURITY.md`. Tant que les placeholders restent en place, toute route `/admin` échoue fermée (403 `CONFIG_MISSING`), jamais un accès par défaut.

## Secrets

Aucun secret dans ce dépôt. `wrangler.toml` ne contient que des identifiants de configuration non sensibles (noms de binding, placeholders explicitement documentés — y compris `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD`, non secrets au sens Cloudflare mais tout de même jamais des valeurs réelles ici). Les vrais `database_id` de staging/production, la vraie configuration Cloudflare Access de staging/production, et tout futur secret (Turnstile, email transactionnel), sont à gérer via les mécanismes Cloudflare (`wrangler secret`, variables d'environnement CI) — pas encore configurés, hors scope de ce brief.

## R2 — configuration (`wrangler.toml`, Implementation Brief 014)

Le binding `MEDIA` (`[[r2_buckets]]`) est déclaré comme `DB` : un placeholder local (`divine-motion-v2-media-local`, aucune ressource Cloudflare réelle), un `[[env.staging.r2_buckets]]` avec un nom de bucket placeholder `REPLACE_WITH_REAL_STAGING_R2_BUCKET_NAME`, aucune section production. Aucun `wrangler r2 bucket create` n'a été exécuté par cette session.

L'upload présigné a besoin en plus de l'API S3 de R2 — une surface d'identifiants séparée du binding `MEDIA` (voir `docs/decisions/ADR-017-r2-direct-upload-lifecycle.md`) :

- `R2_ACCOUNT_ID`/`R2_BUCKET_NAME` — pas des secrets (identifiants nécessaires à construire l'URL S3, même catégorie que `CF_ACCESS_TEAM_DOMAIN`) — placeholders explicites dans `[vars]`/`[env.staging.vars]`.
- `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` — **vrais secrets**, absents de `wrangler.toml` dans tous les environnements, y compris comme placeholders.

### Provisionner R2 staging (procédure manuelle, à exécuter par la personne détenant l'accès Cloudflare)

```bash
npx wrangler r2 bucket create divine-motion-v2-media-staging
# Copier le nom du bucket dans wrangler.toml, section [[env.staging.r2_buckets]] et [env.staging.vars].R2_BUCKET_NAME

# Créer un jeton d'API R2 (tableau de bord Cloudflare → R2 → Manage API tokens),
# donnant Object Read & Write sur ce bucket uniquement — jamais un jeton de compte complet.
npx wrangler secret put R2_ACCESS_KEY_ID --env staging
npx wrangler secret put R2_SECRET_ACCESS_KEY --env staging

# Configurer la politique CORS du bucket (voir "R2 CORS" ci-dessous) via le
# tableau de bord Cloudflare ou `wrangler r2 bucket cors` — nécessaire pour
# que le navigateur puisse PUT directement dessus.
```

**Important** — cette session (Brief 014) n'a exécuté aucune de ces commandes contre un vrai compte Cloudflare. Le scope du brief interdit explicitement tout provisionnement R2 distant sans validation explicite de Boris.

## R2 credentials (identifiants S3 réels)

- **Local** — `.dev.vars` (gitignored, jamais committé), copié depuis `.dev.vars.example`. Sans ce fichier, la génération d'URL présignée fonctionne quand même (signature SigV4 pure, aucun réseau requis) mais l'URL résultante ne pointera pas vers un vrai bucket R2 exploitable — tout le reste du cycle (métadonnées D1, vérification post-upload contre le R2 local Miniflare, UI admin) fonctionne sans ce fichier.
- **Staging/Production** — `wrangler secret put R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` (`--env staging` pour staging), jamais un fichier committé.
- **Typage** — `src/env.d.ts` augmente `Env`/`Cloudflare.Env` à la main pour ces deux clés (jamais générées par `wrangler types`, puisqu'absentes de `wrangler.toml` par choix) — voir le commentaire du fichier pour le raisonnement complet.

## R2 CORS

Un upload direct navigateur → R2 (§42) a besoin d'une politique CORS sur le bucket — sans elle, le navigateur bloque le `PUT` cross-origin vers `*.r2.cloudflarestorage.com` avant même que la requête ne parte. Jamais `*` en production. Politique par environnement (à appliquer via le tableau de bord Cloudflare R2 ou `wrangler r2 bucket cors put`) :

```json
// Local (dev, astro dev) — origine unique, admin local uniquement
[
  {
    "AllowedOrigins": ["http://localhost:4321"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

```json
// Staging
[
  {
    "AllowedOrigins": ["https://staging.divinemotion.ca"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

```json
// Production
[
  {
    "AllowedOrigins": ["https://admin.divinemotion.ca"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

Seule la méthode `PUT` est nécessaire : le navigateur n'utilise jamais R2 directement pour la lecture (l'aperçu admin passe par le Worker, `GET /admin/media/:id/file` — voir `docs/MEDIA_ARCHITECTURE.md`), et l'upload lui-même n'est jamais un `POST` multipart, seulement le `PUT` de l'octet-stream vers l'URL présignée. `Content-Type` est le seul en-tête que le navigateur pourrait envoyer sur ce `PUT` (défini automatiquement par le `Blob`/`File`) — cette politique ne l'exige pas dans la signature elle-même (voir ADR-017), elle l'autorise seulement au niveau CORS pour ne jamais bloquer une requête légitime.

## Validation staging réelle (Validation Brief 014S)

Toute la configuration ci-dessus (D1/R2/Access/CORS/secrets) a été écrite et testée uniquement contre des émulations locales (Miniflare) jusqu'ici — jamais contre un vrai compte Cloudflare. Checklist précise d'exécution manuelle (provisionnement + tests en navigateur réel) : `docs/STAGING_VALIDATION.md`. **Statut : non exécutée** — l'environnement Claude Code qui a écrit Brief 014 n'a aucun accès réseau sortant vers `api.cloudflare.com`/`sparrow.cloudflare.com` (bloqué au niveau du proxy de sortie du sandbox, vérifié empiriquement : `wrangler whoami` échoue, `wrangler login` se bloque, un appel direct à l'API Cloudflare renvoie `403` au niveau du tunnel CONNECT — pas un problème d'identifiants, un problème réseau de l'environnement). Cette validation doit être exécutée par Boris depuis une machine avec un accès réseau réel à Cloudflare.

## Ce qui N'est PAS encore déployable

Aucun Worker applicatif de production ne lit `env.DB`/`env.MEDIA`/Cloudflare Access réel à ce stade — Brief 010 est une fondation D1, Brief 012 un socle admin/auth, Brief 014 une médiathèque + upload R2, aucun des trois une connexion à une infrastructure Cloudflare réelle. `/admin` existe et est protégée, avec deux modules CMS réels (Travail, Médias — voir `docs/CMS_SPEC.md`) ; les autres restent des placeholders. Aucun pipeline de livraison média public (transformation, CDN) n'existe — voir `docs/ROADMAP.md` Phases 5+ pour la suite. Rien dans ce document ne décrit un déploiement réel du site public ou de l'admin.
