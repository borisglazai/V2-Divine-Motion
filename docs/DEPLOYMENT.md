# Deployment — Divine Motion V2

**Statut :** fondation D1 (Implementation Brief 010) + socle admin/Cloudflare Access (Implementation Brief 012) + déploiement staging réel validé (Production Readiness Step 1 — formulaire Contact, voir `docs/REAL_STAGING_VALIDATION_REPORT_CONTACT_STEP1.md`). Ce document couvre la persistance (D1/migrations), la configuration Cloudflare Access, et le chemin de déploiement staging réellement utilisé. Le déploiement applicatif complet (R2 médiathèque, Cloudflare Images, autres modules CMS) n'est pas encore validé en staging réel au-delà du formulaire Contact — voir `docs/ROADMAP.md` pour le séquencement des phases.

## Environnements

```text
local        — développement, sur ce dépôt, base D1 locale (Wrangler/Miniflare)
staging      — Worker `v2-divine-motion` (`*.workers.dev`), déployé via Cloudflare Workers Builds / Git integration depuis `validation/staging-cloudflare` — voir "Déploiement staging" ci-dessous
production   — divinemotion.ca / admin.divinemotion.ca (jamais touché par cette session)
```

`D1 staging != D1 production` (ADR-009) : bases strictement séparées, jamais fusionnées, jamais de script qui écrit dans les deux.

## D1 — configuration (`wrangler.toml`)

Le binding `DB` est déclaré dans `wrangler.toml` à la racine du dépôt.

- **Local** — `database_id = "00000000-0000-0000-0000-000000000000"` : placeholder, pas une ressource Cloudflare réelle. Il sert uniquement de clé pour l'émulation locale Miniflare (`.wrangler/state/`) ; aucun `wrangler d1 create` n'a été exécuté contre un vrai compte Cloudflare.
- **Staging** — `[env.staging]` provisionné et réel : `database_id = "de8bf99e-45c2-407a-b435-52148b379bf2"` (base `divine-motion-v2-staging`). Les 6 migrations existantes sont appliquées sur ce D1 staging distant — voir "Migrations appliquées en staging" ci-dessous.
- **Production** — délibérément absente de `wrangler.toml`. Aucun binding, aucun `database_id`, réel ou inventé.

### Migrations appliquées en staging

Les migrations `0001` à `0006` sont toutes appliquées sur le D1 staging distant (`divine-motion-v2-staging`, `database_id = "de8bf99e-45c2-407a-b435-52148b379bf2"`) :

```
0001_initial.sql
0002_publication_rights_media_change_guard.sql
0003_media_upload_lifecycle.sql
0004_services_cms.sql
0005_home_content_rights_gate.sql
0006_visual_editor_phase2.sql
```

Toutes additives (`CREATE TABLE`/`ADD COLUMN`/triggers/index — aucun `DROP`/`RENAME`/`ALTER TABLE ... NOT NULL` sans défaut/`DELETE FROM` de masse), cohérent avec la politique de migration ci-dessous.

### Politique de migration staging — additive vs destructive

`npm run db:migrate:staging` (`wrangler d1 migrations apply DB --env staging --remote`) fait partie de la commande de déploiement Cloudflare Builds (voir "Déploiement staging" ci-dessous) : elle s'exécute automatiquement à chaque déploiement de `validation/staging-cloudflare`. Wrangler suit les migrations déjà appliquées par nom de fichier (table `d1_migrations` sur le D1 lui-même) — relancer la commande sur des migrations déjà appliquées est un no-op sûr, et un échec de migration est annulé atomiquement sans affecter les migrations précédentes déjà appliquées.

- **Migration additive** (`CREATE TABLE`, `ADD COLUMN` nullable ou avec `DEFAULT`, trigger, index) — reste dans la chaîne automatisée `db:migrate:staging && wrangler deploy`. Sûre par construction : l'ancien code continue de fonctionner même si le déploiement qui suit échoue.
- **Migration destructive ou risquée** (`DROP`, `RENAME`, `ALTER TABLE ... NOT NULL` sans défaut, `UPDATE`/`DELETE` de masse) — **jamais** dans la chaîne automatisée. À appliquer manuellement, séparément, **avant** de merger le code qui en dépend dans `validation/staging-cloudflare` — pour ne jamais laisser de fenêtre où un déploiement échoué après une migration réussie laisse tourner l'ancien code contre un schéma déjà cassé pour lui.

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
npm run db:migrate:staging   # applique migrations/ à D1 staging distant — fait partie de la commande de déploiement Cloudflare Builds (additive uniquement, voir "Politique de migration staging" ci-dessus)
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

## Déploiement staging — chemin réel (Cloudflare Workers Builds / Git integration)

Le chemin de déploiement staging qui fonctionne réellement est **Cloudflare Workers Builds / Git integration**, connecté directement au dépôt `borisglazai/V2-Divine-Motion`, branche `validation/staging-cloudflare` — pas GitHub Actions (voir `docs/REAL_STAGING_VALIDATION_REPORT_CONTACT_STEP1.md` pour l'historique complet, y compris pourquoi `.github/workflows/deploy-staging.yml` est désactivé).

- **Build command** (configuré dans le tableau de bord Cloudflare, pas dans ce dépôt) : `npm run build`
- **Deploy command** (idem) : `npm run db:migrate:staging && npx wrangler deploy --env staging`
- **Variable de build** `CLOUDFLARE_ENV=staging` configurée dans les variables de build Cloudflare — nécessaire pour que `@astrojs/cloudflare`/`@cloudflare/vite-plugin` génère `dist/server/wrangler.json` avec les bindings/vars de `[env.staging]` (sans elle, `wrangler deploy --env staging` lirait quand même une config générée sans `[env.staging]`, faute d'avoir été bakée au build).
- Chaque push sur `validation/staging-cloudflare` déclenche ce build+deploy automatiquement.

### Le libellé « Production » dans le tableau de bord Cloudflare

Le tableau de bord Cloudflare Workers Builds désigne la branche connectée comme la « Production branch » du Worker `v2-divine-motion` — c'est la terminologie propre à Cloudflare Workers Builds pour « la branche dont les push déploient la version active/servie du Worker », **pas** une indication qu'il existe une ressource de production applicative séparée. `wrangler.toml` ne déclare aucune section `[env.production]` ; `v2-divine-motion` reste la seule ressource Worker qui existe, et c'est le Worker **staging** au sens de ce dépôt (D1/R2/KV `-staging`, vars de `[env.staging]`). Le vrai domaine de production (`divinemotion.ca`/`admin.divinemotion.ca`) n'a jamais été touché.

### Observabilité

Workers Observability est activée sur le Worker `v2-divine-motion` (activée par défaut côté plateforme Cloudflare pour les nouveaux Workers) et validée par du trafic réel pendant la validation Contact Step 1 (voir `docs/REAL_STAGING_VALIDATION_REPORT_CONTACT_STEP1.md`). `wrangler.toml` ne déclare pas de bloc `[observability]` explicite — non nécessaire, l'activation par défaut suffit ; à documenter explicitement ici si une configuration non-défaut (sampling rate, etc.) devient un jour nécessaire.

### Rollback staging

**Non exécuté à ce jour** — documenté ici pour être prêt si un déploiement staging s'avère défectueux. Le rollback est une action manuelle, jamais automatisée.

**Rollback du code (Worker)** :

- **Via le tableau de bord Cloudflare** (méthode privilégiée, cohérente avec le chemin de déploiement réel) : Workers & Pages → `v2-divine-motion` → Deployments → sélectionner la version précédente connue-bonne → Rollback. Promotion immédiate sur toutes les routes du Worker ; les 100 dernières versions publiées restent disponibles.
- **Via Wrangler, si nécessaire** (ex. accès dashboard indisponible) : `npx wrangler rollback --env staging [<version-id>]` (sans id : revient à la version précédente). Équivalent fonctionnel au bouton du dashboard, exécuté en ligne de commande.

**Rollback du code ≠ rollback D1.** Revenir à une version antérieure du Worker ne touche à aucune donnée D1 — le code revient en arrière, le schéma reste tel quel. C'est sûr uniquement si toutes les migrations appliquées depuis la version ciblée sont additives (voir "Politique de migration staging" ci-dessus) : l'ancien code n'a alors jamais besoin des colonnes/tables ajoutées depuis, il les ignore simplement. Si une migration destructive ou risquée a été appliquée depuis la version ciblée, un rollback de code seul peut laisser le Worker face à un schéma qu'il ne sait plus lire (colonne renommée/supprimée qu'il attend encore) — **vérifier la compatibilité du schéma avant tout rollback** : comparer les migrations appliquées entre la version courante et la version cible (`npx wrangler d1 execute DB --env staging --remote --command "SELECT * FROM d1_migrations ORDER BY id;"`), et si une migration non additive est en cause, traiter la restauration des données séparément (voir `docs/BACKUP_RECOVERY.md`) plutôt que de supposer qu'un rollback de code suffit.

**Après rollback — revalidation obligatoire**, avant de considérer l'incident clos :

- `/` (accueil), `/travail`, `/services`, `/contact` — chargement correct, pas d'erreur 500.
- Admin (`/admin`) — connexion Access réelle, dashboard fonctionnel.
- Envoi Contact — soumission réelle, Turnstile, réception Resend (même check que la validation Step 1 — voir `docs/REAL_STAGING_VALIDATION_REPORT_CONTACT_STEP1.md`).

## Validation staging réelle

Le déploiement staging (D1 migré `0001`-`0006`, formulaire Contact, Turnstile réel, envoi Resend réel) est réellement validé — voir `docs/REAL_STAGING_VALIDATION_REPORT_CONTACT_STEP1.md` (Production Readiness Step 1). Checklist détaillée utilisée pour cette validation et pour les validations staging suivantes (R2/médiathèque, Access, etc.) : `docs/STAGING_VALIDATION.md`. Les sections de cette checklist au-delà du formulaire Contact (upload média, Cloudflare Access, CORS R2, etc.) n'ont pas encore été exécutées en réel — à traiter au fur et à mesure que ces fonctionnalités entrent dans le périmètre de Production Readiness.

Cette session Claude Code n'a toujours aucun accès réseau sortant vers Cloudflare — toute validation réelle est exécutée par Boris et rapportée ici telle que communiquée, jamais exécutée ou supposée par cette session.

## Ce qui est déployé et validé en staging réel

Le Worker staging `v2-divine-motion` lit réellement `env.DB` (D1 staging migré `0001`-`0006`, ex. `getSiteSettings` pour le formulaire Contact — voir `docs/REAL_STAGING_VALIDATION_REPORT_CONTACT_STEP1.md`) et les vars/secrets Contact (Turnstile, Resend) en conditions réelles. `/admin` existe et est protégée, avec deux modules CMS réels (Travail, Médias — voir `docs/CMS_SPEC.md`) ; leur usage réel de `env.MEDIA`/R2 et de Cloudflare Access en staging n'est pas couvert par la validation Contact Step 1 ci-dessus et reste à valider via `docs/STAGING_VALIDATION.md` au fur et à mesure. Aucun pipeline de livraison média public (transformation, CDN) n'existe — voir `docs/ROADMAP.md` Phases 5+ pour la suite. Rien dans ce document ne décrit un déploiement de production (`divinemotion.ca`/`admin.divinemotion.ca`), jamais touché.
