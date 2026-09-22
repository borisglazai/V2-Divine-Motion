# PRODUCTION READINESS — STEP 2 (STAGING DEPLOYMENT & OBSERVABILITY) — REAL STAGING VALIDATION REPORT

Branche : `validation/staging-cloudflare`
Worker staging : `v2-divine-motion`
Production : non touchée, aucun déploiement production effectué à aucun moment de ce step.

Ce rapport ne documente que ce qui a été réellement vérifié. Les faits d'infrastructure Cloudflare (chemin de déploiement, variables de build, observabilité activée, migrations appliquées) ont été confirmés directement par Boris depuis le tableau de bord Cloudflare — cette session Claude Code n'a aucun accès réseau sortant vers Cloudflare et ne les a donc pas vérifiés elle-même ; ils sont rapportés ici tels que communiqués, distincts des points vérifiables directement dans le dépôt (code, configuration, documentation), qui le sont.

---

## 1. Architecture réelle du déploiement staging

Le chemin de déploiement staging est **Cloudflare Workers Builds / Git integration**, connecté directement au dépôt `borisglazai/V2-Divine-Motion`, branche `validation/staging-cloudflare`. Chaque push sur cette branche déclenche un build + deploy automatique côté Cloudflare — aucun `wrangler deploy` manuel depuis un poste local, aucune dépendance à GitHub Actions.

Le tableau de bord Cloudflare Workers Builds désigne cette branche connectée comme la « Production branch » du Worker — terminologie propre à Cloudflare Workers Builds pour « la branche dont les push déploient la version active/servie du Worker », **pas** une indication qu'il existe une ressource de production applicative séparée. `wrangler.toml` ne déclare aucune section `[env.production]` ; `v2-divine-motion` reste la seule ressource Worker qui existe, et c'est le Worker **staging** au sens de ce dépôt (D1/R2/KV `-staging`, vars de `[env.staging]`). Le vrai domaine de production (`divinemotion.ca`/`admin.divinemotion.ca`) n'a jamais été touché par ce step.

## 2. Commandes build/deploy

Configurées dans les variables de build du tableau de bord Cloudflare (pas dans ce dépôt) :

- **Build command** : `npm run build`
- **Deploy command** : `npm run db:migrate:staging && npx wrangler deploy --env staging`
- **Variable de build** `CLOUDFLARE_ENV=staging` — confirmée présente dans les variables de build Cloudflare. Nécessaire pour que `@astrojs/cloudflare`/`@cloudflare/vite-plugin` génère `dist/server/wrangler.json` avec les bindings/vars de `[env.staging]` au moment du build (voir `docs/DEPLOYMENT.md` "Déploiement staging" pour le détail du mécanisme).

## 3. Bindings staging

D'après `wrangler.toml` `[env.staging]`, confirmés actifs par la validation Contact Step 1 (voir `docs/REAL_STAGING_VALIDATION_REPORT_CONTACT_STEP1.md` §3) :

| Binding | Type | Ressource |
|---|---|---|
| `DB` | D1 | `divine-motion-v2-staging` (`de8bf99e-45c2-407a-b435-52148b379bf2`) |
| `MEDIA` | R2 | `divine-motion-v2-media-staging` |
| `SESSION` | KV | session Astro/adapter Cloudflare |
| `RATE_LIMIT` | KV | rate limiting formulaire Contact |
| `RESEND_API_KEY` | secret | envoi email Contact |
| `TURNSTILE_SECRET_KEY` | secret | vérification Turnstile |

## 4. Migrations D1 staging (0001–0006)

Les 6 migrations existantes sont appliquées sur le D1 staging distant :

```
0001_initial.sql
0002_publication_rights_media_change_guard.sql
0003_media_upload_lifecycle.sql
0004_services_cms.sql
0005_home_content_rights_gate.sql
0006_visual_editor_phase2.sql
```

Toutes additives (`CREATE TABLE`/`ADD COLUMN`/triggers/index — vérifié par grep sur le dossier `migrations/` : aucun `DROP`/`RENAME`/`ALTER TABLE ... NOT NULL` sans défaut/`DELETE FROM` de masse dans le SQL réellement exécuté).

## 5. Politique de migration (additive vs destructive)

`npm run db:migrate:staging` (`wrangler d1 migrations apply DB --env staging --remote`) fait partie de la chaîne de déploiement automatisée. Wrangler suit les migrations déjà appliquées par nom de fichier (table `d1_migrations`) — relancer sur des migrations déjà appliquées est un no-op sûr, et un échec de migration est annulé atomiquement sans affecter les migrations précédentes.

- **Additive** (`CREATE TABLE`, `ADD COLUMN` nullable/avec `DEFAULT`, trigger, index) — reste dans la chaîne automatisée `db:migrate:staging && wrangler deploy`.
- **Destructive/risquée** (`DROP`, `RENAME`, `ALTER TABLE ... NOT NULL` sans défaut, `UPDATE`/`DELETE` de masse) — **jamais** automatisée. Appliquée manuellement, séparément, avant de merger le code qui en dépend dans `validation/staging-cloudflare`.

Détail complet : `docs/DEPLOYMENT.md` "Politique de migration staging — additive vs destructive".

## 6. Observabilité

Workers Observability est activée sur `v2-divine-motion` (activation par défaut côté plateforme Cloudflare pour les nouveaux Workers) et validée par du trafic réel — confirmé par Boris, cohérent avec le trafic réel généré pendant la validation Contact Step 1. `wrangler.toml` ne déclare pas de bloc `[observability]` explicite ; non nécessaire, l'activation par défaut suffit.

## 7. Rollback — documenté, non exécuté

La procédure de rollback staging est maintenant documentée dans `docs/DEPLOYMENT.md` ("Rollback staging") :

- Rollback du code via le tableau de bord Cloudflare : Workers & Pages → `v2-divine-motion` → Deployments → version précédente → Rollback.
- Équivalent en ligne de commande si nécessaire : `npx wrangler rollback --env staging [<version-id>]`.
- **Rollback du code ≠ rollback D1** : revenir à une version antérieure du Worker ne touche à aucune donnée D1 ; sûr uniquement si les migrations appliquées depuis la version ciblée sont additives — à vérifier explicitement avant tout rollback (comparer les migrations appliquées entre la version courante et la version cible).
- Après rollback : revalider `/`, `/travail`, `/services`, `/contact`, l'admin, et l'envoi Contact (Turnstile + réception Resend).

**Aucun rollback n'a été exécuté** — le staging fonctionne correctement, cette procédure est écrite pour être prête si un déploiement futur s'avère défectueux, pas exécutée dans le cadre de ce step.

## 8. GitHub Actions — désactivé

`.github/workflows/deploy-staging.yml` reste désactivé (`if: false`), inchangé depuis la clôture de Production Readiness Step 1. Le chemin GitHub Actions échouait systématiquement (`Authentication error [code: 10000]` sur `GET /accounts/<account>/workers/services/v2-divine-motion`, probable bug Cloudflare côté autorisation granulaire des Workers, GA le 2026-09-15) — voir `docs/REAL_STAGING_VALIDATION_REPORT_CONTACT_STEP1.md` §6-7 pour l'historique complet. Cloudflare Workers Builds / Git integration reste le seul chemin de déploiement staging réellement utilisé.

## 9. Aucun déploiement production

Aucune ressource production (D1, R2, domaine, Access, migration, secrets) n'a été créée, modifiée ou déployée à aucun moment de ce step. `wrangler.toml` ne déclare toujours aucune section `[env.production]`. Ce step ne documente et ne rapporte que des faits staging.

---

## Confirmation finale

```
PRODUCTION READINESS STEP 2 — STAGING DEPLOYMENT & OBSERVABILITY: VALIDATED
READY TO CLOSE STEP 2: YES
ROLLBACK PROCEDURE: DOCUMENTED, NOT EXECUTED
STAGING DEPLOYMENT PATH: CLOUDFLARE BUILDS / GIT INTEGRATION
NO PRODUCTION DEPLOYMENT PERFORMED
```
