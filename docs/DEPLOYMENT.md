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

## Ce qui N'est PAS encore déployable

Aucun Worker applicatif de production ne lit `env.DB`/Cloudflare Access réel à ce stade — Brief 010 est une fondation D1, Brief 012 un socle admin/auth, ni l'un ni l'autre une connexion à une infrastructure Cloudflare réelle. `/admin` existe et est protégée, mais reste un Dashboard en lecture seule + des placeholders (voir `docs/CMS_SPEC.md`) : aucun CRUD, aucun upload, aucun Visual Editor. Rien dans ce document ne décrit un déploiement réel du site public ou de l'admin — voir `docs/ROADMAP.md` Phases 5+ pour la suite.
