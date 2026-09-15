# ADR-017 — Upload R2 direct : presigned URL, lifecycle, sémantique des timestamps

**Décision.** Upload direct navigateur → R2 par URL présignée S3-compatible, signée SigV4 via `aws4fetch` (petite dépendance, pas de crypto maison — Brief 014 §8). Cycle de vie en 5 états déjà présents au schéma (`pending → uploaded → ready`, ou `failed`/`abandoned`), chacun une transition D1 distincte. `media.authorized_at` (nouvelle colonne, migration 0003) porte le sens précis « ligne créée / upload autorisé » ; `uploaded_at` reste tel quel au niveau schéma (voir plus bas — Option A essayée et rejetée empiriquement).

## Presigned PUT — pourquoi `aws4fetch`, pas de signature maison

R2 expose une API S3-compatible pour les opérations qui nécessitent une URL utilisable directement par le navigateur (le binding natif `R2Bucket` d'un Worker — `env.MEDIA.put()/get()/head()` — ne produit aucune URL signée exploitable côté client ; il ne fonctionne que server-side, à l'intérieur du Worker). Une URL PUT présignée S3 exige une signature SigV4 (AWS), un algorithme standard mais non trivial à réimplémenter correctement (dérivation de clé HMAC-SHA256 en chaîne, canonicalisation stricte de la requête). `aws4fetch` est la bibliothèque de référence utilisée jusque dans la documentation Cloudflare elle-même pour cet usage précis — minuscule (une classe `AwsClient`), sans dépendance transitive lourde, compatible Workers. Écrire cette signature à la main aurait été exactement le genre de choix que Brief 014 §8 interdit explicitement.

`src/lib/storage/r2-presign.ts` isole cet appel : une fonction pure qui reçoit les identifiants S3 (account id, access key id, secret access key, nom du bucket) et la clé cible en paramètres explicites — jamais lue depuis `cloudflare:workers` elle-même (voir `src/lib/storage/env.ts`, le seul fichier qui touche au binding/aux secrets réels, même convention que `src/lib/db/client.ts`/`src/lib/auth/env.ts`). Ça la rend testable sous `node --test` avec des identifiants factices, sans réseau.

## Expiration

15 minutes (Brief 014 §17 : « 10-15 minutes, pas plusieurs heures »). Assez pour un upload ~24 Mpx sur une connexion raisonnable, assez court pour limiter la fenêtre d'exploitation d'une URL qui fuiterait.

## Lifecycle exact

```text
authorize          → pending    (authorized_at posé, ligne D1 créée)
PUT réussi côté R2 → uploaded   (confirmé par HEAD R2 au moment de /upload-complete, uploaded_at réel posé)
vérification OK    → ready      (dimensions lues, magic bytes cohérents, taille correspond)
vérification KO    → failed
jamais complété     → abandoned (cleanup — voir plus bas)
```

`pending → uploaded` et `uploaded → ready` sont deux écritures D1 distinctes, toutes deux déclenchées par le même appel serveur à `/admin/media/:id/upload-complete` (le seul moment où le serveur apprend quoi que ce soit sur l'état réel de l'objet R2) — mais représentent deux faits différents : « l'objet existe dans R2 » puis « l'objet est un fichier image valide, cohérent avec ce qui a été annoncé ». Une transition `uploaded` sans jamais atteindre `ready` reste possible (échec de validation après confirmation de présence) et se distingue proprement de `pending` qui n'a jamais été confirmée du tout.

## `abandoned` — nettoyage

Pas de Cron Trigger dans ce lot (Brief 014 §18 : « une fonction cleanup réutilisable suffit »). `src/lib/db/media.ts` expose `abandonStalePendingMedia(db, olderThanMs)` : marque `abandoned` toute ligne `pending` dont `authorized_at` dépasse le seuil — appelable manuellement, depuis un futur Cron Trigger (hors scope), ou avant de lister la médiathèque (optionnel). Le choix de piloter sur `authorized_at` plutôt que `created_at` est déliberé : c'est la colonne dont le sens est sans ambiguïté « quand l'upload a été autorisé », exactement ce qu'on veut mesurer pour détecter un abandon.

## Sémantique de `uploaded_at` — Option A essayée, rejetée empiriquement ; Option B retenue

**Option A (rendre `uploaded_at` nullable, le remplir seulement à la confirmation réelle) a été tentée en premier** — la lecture la plus nette sur le papier. SQLite/D1 n'a pas d'`ALTER TABLE ... ALTER COLUMN` : relaxer une contrainte `NOT NULL` exige la technique standard « recréer la table » (`CREATE TABLE media_new (...)`, `INSERT INTO media_new SELECT * FROM media`, `DROP TABLE media`, `ALTER TABLE media_new RENAME TO media`). `media` est référencée par des clés étrangères actives depuis six tables (`work_items`, `services`, `testimonials`, `home_content`, `about_content`, `page_seo`).

**Vérifié empiriquement contre un vrai D1 local** (pas supposé — même discipline que le reste de ce projet) : `DROP TABLE media` avec des lignes `work_items` la référençant échoue avec `FOREIGN KEY constraint failed: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_TRIGGER)`, **même précédé de `PRAGMA foreign_keys=OFF;` dans le même appel `wrangler d1 execute`**. Raison : ce projet a déjà documenté (`docs/TECHNICAL_ARCHITECTURE.md`) qu'un appel `wrangler d1 execute --command "stmt1; stmt2;"` s'exécute comme une seule transaction atomique — et `PRAGMA foreign_keys` est un no-op documenté de SQLite lorsqu'il est positionné à l'intérieur d'une transaction déjà ouverte. Une migration D1 (fichier entier envoyé comme un seul batch) a la même contrainte. Tester une migration séparée « juste le PRAGMA » ne résout rien non plus : chaque connexion locale D1 réinitialise `foreign_keys` à `ON` par défaut (déjà documenté, Brief 010), donc le pragma ne survit pas entre deux appels séparés. La technique de recréation de table est donc **structurellement inapplicable ici** sans un chantier bien plus large (recréer aussi les six tables référençantes) — disproportionné pour ce correctif.

**Option B retenue** : ajouter `authorized_at` (migration 0003, simple `ALTER TABLE ... ADD COLUMN`, aucun risque FK) et laisser le schéma de `uploaded_at` inchangé (`NOT NULL`, tel quel). Au niveau applicatif (`src/lib/db/media.ts`) :
- `createMediaMetadata` pose désormais `authorized_at = maintenant` (le sens précis que Brief 014 §14 demandait) **et** initialise `uploaded_at` à la même valeur — un placeholder honnête (« pas encore confirmé, ceci est une estimation provisoire identique à l'autorisation »), jamais un mensonge arbitraire, jamais un sentinel opaque type `0`/`NULL`-déguisé.
- `markMediaUploaded` (nouvelle fonction) écrase `uploaded_at` avec l'horodatage réel dès que `/upload-complete` confirme la présence de l'objet via `HEAD` R2.
- Conséquence documentée : `uploaded_at` n'a un sens fiable que pour une ligne dont `processing_status` est `'uploaded'` ou `'ready'` — pour une ligne `'pending'`, sa valeur est le même placeholder qu'`authorized_at`, pas une confirmation. `authorized_at`, lui, est fiable dans tous les cas.

## CORS R2

Documenté précisément (pas de résumé vague) dans `docs/DEPLOYMENT.md` "R2 CORS" — jamais `*` en production, origins explicites par environnement.
