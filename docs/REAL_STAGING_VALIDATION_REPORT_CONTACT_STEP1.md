# PRODUCTION READINESS — STEP 1 (FORMULAIRE CONTACT) — REAL STAGING VALIDATION REPORT

Branche : `validation/staging-cloudflare`
URL validée : `https://v2-divine-motion.borisglazaicanada.workers.dev/contact`
Production : non touchée, aucun déploiement production effectué à aucun moment de ce step.

Commits principaux (implémentation + corrections de déploiement staging, dans l'ordre) :
- `b470701` — Formulaire Contact réel (validation serveur, Turnstile, envoi Resend via `fetch()`, aucune persistance D1 — ADR-015)
- `f7a70d0` / `2b68de4` — Ajout du workflow `deploy-staging.yml` (staging/main)
- `5459ca4` / `f832c81` — Node 22 pour le build du workflow
- `79fef7d` — `wrangler.toml` : `[env.staging].name`, id KV `RATE_LIMIT` réel, `TURNSTILE_SITE_KEY`/`CONTACT_FROM_EMAIL` réels
- `bd6cbfe` / `cd61005` — `CLOUDFLARE_ENV=staging` sur l'étape Build (fait que `wrangler deploy` lise réellement `[env.staging]`)
- `06959c3` — Wrangler `4.131.2` → `4.136.3`

Ce rapport ne documente que ce qui a été réellement vérifié. Les points de validation fonctionnelle (Turnstile réel, soumission réelle, réception réelle de l'email) ont été confirmés manuellement par Boris directement sur l'URL staging ci-dessus — je n'ai pas d'accès réseau sortant vers Cloudflare/Resend depuis cette session et ne les ai donc pas exécutés moi-même ; ils sont rapportés ici tels que communiqués, distincts des points que j'ai pu vérifier directement dans le dépôt (code, configuration, pipeline local).

---

## 1. Validation manuelle réelle — confirmée par Boris

Sur `https://v2-divine-motion.borisglazaicanada.workers.dev/contact` :

- Chargement de la page : OK
- Widget Turnstile réel : chargé et validé avec succès (pas les clés de test locales — les vraies clés Cloudflare staging)
- Soumission réelle du formulaire (nom, courriel, téléphone, type de prestation, date, lieu, message) : succès
- Message de succès affiché : *« Votre message a été envoyé. Nous vous répondrons rapidement. »*
- Après succès, le formulaire est réinitialisé correctement (comportement attendu du cycle POST/redirect/GET + flash — `src/lib/admin/flash.ts`, `src/pages/contact.astro`)

## 2. Resend réel — confirmé par Boris

- Email réellement reçu dans la boîte du destinataire configuré (`site_settings.contact_email`)
- Contenu reçu correct et complet, les 7 champs du formulaire présents :
  - nom
  - courriel
  - téléphone
  - type de prestation
  - date
  - lieu
  - message
- Aucune métadonnée technique (IP, user-agent) dans l'email — conforme à la conception (`src/lib/contact/email.ts`)

## 3. Bindings / variables runtime — état confirmé

D'après la configuration communiquée par Boris comme réellement active sur le Worker staging (et cohérente avec `wrangler.toml` `[env.staging]` sur ce commit) :

| Nom | Type | État |
|---|---|---|
| `RESEND_API_KEY` | secret | présent (runtime) |
| `TURNSTILE_SECRET_KEY` | secret | présent (runtime) |
| `TURNSTILE_SITE_KEY` | var | présent, valeur réelle |
| `CONTACT_FROM_EMAIL` | var | `onboarding@resend.dev` |
| `RATE_LIMIT` | KV | lié |
| `DB` | D1 | lié |
| `MEDIA` | R2 | lié |
| `SESSION` | KV | lié |

Ces deux derniers secrets (`RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`) n'ont jamais été gérés ni lus par ce dépôt ni par aucun commit de ce step (§ conception initiale du formulaire Contact) — cohérent avec leur présence exclusivement côté Cloudflare.

## 4. Réparation `site_settings` (staging) — confirmée par Boris

`site_settings` (staging) manquait sa ligne unique (`id = 1`) ou avait un `contact_email` incorrect — réparé manuellement, hors de ce dépôt :
- `id = 1`
- `contact_email = borisglazaicanada@gmail.com`

C'est ce champ que `handleContactSubmission` (`src/lib/contact/submit-action.ts` via `getSiteSettings`) utilise comme destinataire de l'email — sa présence était un pré-requis fonctionnel pour que l'envoi Resend réussisse, indépendant du code applicatif lui-même (aucun changement de code nécessaire ici).

## 5. Chemin de déploiement staging validé : Cloudflare Workers Builds / Git integration

**Constat officiel de ce step** : le chemin de déploiement staging qui fonctionne réellement aujourd'hui est **Cloudflare Workers Builds / Git integration**, déjà connecté au dépôt `borisglazai/V2-Divine-Motion`, branche `validation/staging-cloudflare`. C'est par ce chemin — pas par GitHub Actions — que le commit courant s'est retrouvé déployé et validé manuellement ci-dessus.

## 6. Bug GitHub Actions / Wrangler — `Authentication error [code: 10000]`

`.github/workflows/deploy-staging.yml` échoue systématiquement à l'étape de déploiement, avant tout upload, sur :
```
GET /accounts/<account>/workers/services/v2-divine-motion
Authentication error [code: 10000]
```

Ceci a été audité en profondeur au cours de ce step (voir l'historique de conversation "AUDIT BLOQUANT — DÉPLOIEMENT CLOUDFLARE STAGING" et "STRATÉGIE DE CONTOURNEMENT") :
- confirmé : c'est l'appel de pré-vérification que `wrangler deploy` fait systématiquement (`preUploadApiChecks`, code source de `wrangler`), avant tout upload — donc jamais un problème de contenu du build ni du nom de cible (le nom `v2-divine-motion` et `CLOUDFLARE_ENV=staging` ont été confirmés corrects dans cette même série d'échecs) ;
- testé et écarté comme cause : deux types de token API Cloudflare distincts (granulaire *Specified Workers → v2-divine-motion → Editor*, puis classique *Workers Scripts: Write* + *Workers KV Storage* + *Account Settings: Read*) — échec identique avec les deux ;
- testé et écarté comme cause : mise à jour de Wrangler `4.131.2` → `4.136.3` (commit `06959c3`) — échec identique ;
- très probable (preuves datées, non confirmées officiellement par le support Cloudflare) : friction/bug actif dans le tout nouveau système d'autorisation granulaire des Workers de Cloudflare (disponibilité générale le 15 septembre 2026), corroboré par plusieurs rapports communautaires quasi simultanés décrivant exactement le même symptôme sur le même endpoint.

**Conséquence pratique retenue pour ce step** : ce n'est pas un défaut de ce dépôt ni de sa configuration — Cloudflare Workers Builds / Git integration est adopté comme chemin de déploiement staging validé, et GitHub Actions `deploy-staging.yml` est désactivé (§7) plutôt que de continuer à en dépendre.

## 7. `deploy-staging.yml` — désactivé, pas supprimé

Le fichier reste dans le dépôt, avec :
- un bloc de commentaire en tête expliquant précisément pourquoi (le bug ci-dessus, le chemin de déploiement désormais utilisé, comment réactiver le jour où Cloudflare corrige le problème) ;
- `if: false` au niveau du job — un déclenchement accidentel via `workflow_dispatch` (toujours visible/listé dans l'onglet Actions) se termine immédiatement en *skipped*, sans consommer de run ni retenter un appel déjà connu pour échouer.

---

## Confirmation finale

```
PRODUCTION READINESS STEP 1 — CONTACT FORM: REAL STAGING VALIDATED: YES
READY TO CLOSE STEP 1: YES
STAGING DEPLOYMENT PATH: CLOUDFLARE BUILDS / GIT INTEGRATION
GITHUB ACTIONS DEPLOY-STAGING: DISABLED
NO PRODUCTION DEPLOYMENT PERFORMED
```
