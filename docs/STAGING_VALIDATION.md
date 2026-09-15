# Staging Validation Checklist — Validation Brief 014S

**Pourquoi ce document existe.** L'environnement Claude Code qui a construit Brief 014 n'a aucun accès réseau sortant vers Cloudflare (`api.cloudflare.com` et `sparrow.cloudflare.com` sont bloqués au niveau du proxy de sortie de ce sandbox — vérifié empiriquement : `wrangler whoami` non authentifié, `wrangler login` bloque, `curl https://api.cloudflare.com/...` renvoie `403` au niveau du tunnel CONNECT). Toute la validation Cloudflare réelle (D1/R2/Access/deploy/navigateur) doit donc être exécutée par Boris, depuis une machine avec un accès réseau réel à Cloudflare — cette page est la checklist précise à suivre pendant cette exécution.

**Ce document ne remplace pas** `docs/DEPLOYMENT.md` (commandes de provisionnement détaillées, politique CORS exacte, gestion des secrets) — il s'y réfère. Le suivre dans l'ordre.

**Rappel des interdits absolus** (Validation Brief 014S §2) : aucune ressource production (D1/R2/domaine/Access/migration/secrets), pas de merge `main`, pas de déploiement public final. Tout ce qui suit vise exclusivement le **staging**.

**Stop conditions** (§4) : si une étape exige la création d'une ressource payante non déjà prévue, un accès compte indisponible, un secret détenu uniquement par Boris, une modification DNS non triviale, ou toute action irréversible non couverte ci-dessous — s'arrêter et trancher avant de continuer, plutôt que d'improviser.

---

## Comment utiliser cette checklist

Chaque section a des cases à cocher et un bloc **Evidence** à remplir (commande exécutée, code HTTP, extrait de log technique, état D1/R2). Pas besoin d'un outil sophistiqué — copier les résultats bruts suffit. Une fois complétée, transmettre ce fichier rempli (ou son contenu) à la session Claude Code qui a une vue sur le code, pour qu'elle rédige le `REAL STAGING VALIDATION REPORT 014S` final (§48 du brief).

---

## 0. Pré-requis

- [ ] Accès à un compte Cloudflare avec les droits nécessaires (D1, R2, Workers, Access).
- [ ] `wrangler login` réussi depuis une machine avec accès réseau réel (`npx wrangler whoami` doit afficher une identité).
- [ ] Décision : réutiliser une ressource staging existante si elle existe déjà (§6 du brief — ne rien dupliquer inutilement). Vérifier d'abord :
  ```bash
  npx wrangler d1 list
  npx wrangler r2 bucket list
  # Access applications : tableau de bord Cloudflare Zero Trust → Access → Applications
  ```

**Evidence :**
```
(coller ici la sortie de `wrangler whoami`, `wrangler d1 list`, `wrangler r2 bucket list`)
```

---

## 1. D1 staging

Procédure complète : `docs/DEPLOYMENT.md` "D1 — configuration" + "Provisionner D1 staging".

- [ ] `wrangler d1 create divine-motion-v2-staging` (seulement si aucune base staging n'existe déjà).
- [ ] Coller le `database_id` réel dans `wrangler.toml`, section `[env.staging.d1_databases]` (remplace `REPLACE_WITH_REAL_STAGING_D1_DATABASE_ID`).
- [ ] Appliquer les 3 migrations, dans l'ordre, via Wrangler remote :
  ```bash
  npx wrangler d1 migrations apply DB --env staging --remote
  ```
- [ ] Vérifier la liste des migrations appliquées :
  ```bash
  npx wrangler d1 execute DB --env staging --remote --command "SELECT * FROM d1_migrations ORDER BY id;"
  ```
  Attendu : `0001_initial.sql`, `0002_publication_rights_media_change_guard.sql`, `0003_media_upload_lifecycle.sql`, dans cet ordre, aucune erreur.
- [ ] Vérifier les tables présentes :
  ```bash
  npx wrangler d1 execute DB --env staging --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name;"
  ```
  Attendu : les 16 tables listées dans `docs/DATA_ARCHITECTURE.md`/`tests/db/invariants.test.mjs` ("migration 0001 created all expected tables").
- [ ] Vérifier les 6 triggers de droits de publication :
  ```bash
  npx wrangler d1 execute DB --env staging --remote --command "SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name;"
  ```
  Attendu : `trg_testimonials_rights_gate_en`, `trg_testimonials_rights_gate_fr`, `trg_testimonials_rights_gate_media_change`, `trg_work_items_rights_gate_en`, `trg_work_items_rights_gate_fr`, `trg_work_items_rights_gate_media_change`.
- [ ] Vérifier `media.authorized_at` existe :
  ```bash
  npx wrangler d1 execute DB --env staging --remote --command "PRAGMA table_info(media);"
  ```

**Evidence :**
```
(coller les sorties des 4 commandes ci-dessus)
```

---

## 2. Seed staging

Données fictives uniquement, pas de PII — voir `seeds/local.sql` comme base.

- [ ] Seed minimal appliqué (quelques services, work items, médias metadata) :
  ```bash
  npx wrangler d1 execute DB --env staging --remote --file=seeds/local.sql
  ```
  (ou une variante réduite si le fichier local contient plus que nécessaire — à ajuster sur place, aucune donnée réelle de client).

**Evidence :**
```
(confirmer le nombre de lignes insérées par table, ou skip si déjà seedé)
```

---

## 3. R2 staging

Procédure complète : `docs/DEPLOYMENT.md` "R2 — configuration" + "Provisionner R2 staging".

- [ ] `wrangler r2 bucket create divine-motion-v2-media-staging` (seulement si aucun bucket staging n'existe déjà).
- [ ] Mettre à jour `wrangler.toml` : `[[env.staging.r2_buckets]].bucket_name` et `[env.staging.vars].R2_BUCKET_NAME`.
- [ ] Confirmer le binding `MEDIA` est bien distinct de tout futur bucket production (aucune section `[[r2_buckets]]` production ne doit exister dans `wrangler.toml` — vérifier qu'elle est toujours absente).

**Evidence :**
```
(nom du bucket créé/réutilisé, confirmation qu'aucune section R2 production n'a été ajoutée à wrangler.toml)
```

---

## 4. Credentials SigV4 (R2 API token)

- [ ] Créer un jeton d'API R2 scoped au bucket staging uniquement (tableau de bord Cloudflare → R2 → Manage API tokens) — principe du moindre privilège, jamais un jeton de compte complet.
- [ ] Poser les secrets (jamais commités) :
  ```bash
  npx wrangler secret put R2_ACCESS_KEY_ID --env staging
  npx wrangler secret put R2_SECRET_ACCESS_KEY --env staging
  ```
- [ ] Confirmer `R2_ACCOUNT_ID`/`R2_BUCKET_NAME` sont posés dans `[env.staging.vars]` (pas des secrets, mais ne doivent plus être des placeholders `REPLACE_WITH_...` une fois déployés).

**Evidence :**
```
(confirmer les 2 `wrangler secret put` exécutés avec succès — ne jamais coller la valeur des secrets ici)
```

---

## 5. Variables staging (récapitulatif)

Aucune valeur placeholder ne doit rester sur le déploiement staging réel :

| Variable | Type | Où |
|---|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | non-secret | `[env.staging.vars]` |
| `CF_ACCESS_AUD` | non-secret | `[env.staging.vars]` |
| `R2_ACCOUNT_ID` | non-secret | `[env.staging.vars]` |
| `R2_BUCKET_NAME` | non-secret | `[env.staging.vars]` |
| `R2_ACCESS_KEY_ID` | **secret** | `wrangler secret put --env staging` |
| `R2_SECRET_ACCESS_KEY` | **secret** | `wrangler secret put --env staging` |

- [ ] Les 4 non-secrets sont posés dans `wrangler.toml` avec de vraies valeurs (pas de `REPLACE_WITH_...`).
- [ ] Les 2 secrets sont posés via `wrangler secret put --env staging` (jamais dans `wrangler.toml`).

---

## 6. CORS R2 réel

Politique exacte à appliquer : `docs/DEPLOYMENT.md` "R2 CORS" (bloc "Staging").

- [ ] Appliquée sur le bucket staging (tableau de bord R2 → bucket → Settings → CORS Policy, ou `wrangler r2 bucket cors put` si disponible dans la version de Wrangler utilisée).
- [ ] Origins : uniquement l'admin staging réel (pas `*`).
- [ ] Méthodes : `PUT` uniquement (voir justification dans `docs/DEPLOYMENT.md` — aucune lecture directe R2 depuis le navigateur dans cette architecture).
- [ ] Headers : `Content-Type`.

**Evidence :**
```
(coller la politique JSON réellement appliquée)
```

---

## 7. Cloudflare Access staging

- [ ] Application Access créée pour l'hostname admin staging réel (ex. `admin-staging.divinemotion.ca` ou équivalent déjà existant — réutiliser si présent, §6 du brief).
- [ ] Policy : autorise uniquement Boris / comptes explicitement listés.
- [ ] Session duration raisonnable (ex. 24h, à ajuster selon préférence).
- [ ] `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` réels posés dans `wrangler.toml` `[env.staging.vars]` (remplacent les placeholders).

**Evidence :**
```
(hostname exact, AUD tag — sans coller le secret d'application Access s'il y en a un)
```

---

## 8. Déploiement staging

- [ ] Build + deploy staging uniquement :
  ```bash
  npm run build
  npx wrangler deploy --env staging
  ```
- [ ] Confirmer les bindings actifs (D1 remote, R2 remote, vars, secrets) dans la sortie de `wrangler deploy` ou via le tableau de bord Workers.
- [ ] **Aucun `wrangler deploy` sans `--env staging` n'a été exécuté** (ce qui viserait la production par défaut si une section `[env.production]` existait — elle n'existe pas dans ce dépôt, donc un deploy sans `--env` échouerait de toute façon, mais à vérifier explicitement).

**Evidence :**
```
(sortie de `wrangler deploy --env staging`)
```

---

## 9. Validation JWT réelle (§13-14 du brief)

- [ ] Sans en-tête Access → requête bloquée (401/403), aucune donnée admin.
- [ ] Avec une session Access valide (login réel via navigateur) → dashboard accessible.
- [ ] `verifyAccessJwt()` confirmé fonctionnel : le dashboard affiche l'email réel de l'identité connectée.

**Evidence :**
```
(codes HTTP observés, capture ou description de ce qui s'affiche)
```

---

## 10. Test dashboard admin (§16)

- [ ] Login Access réel.
- [ ] `/admin` (Dashboard) affiche les compteurs D1 réels (correspondant au seed staging).
- [ ] Reload → aucune erreur, données stables.

---

## 11. Upload JPEG léger réel (§17)

Depuis un navigateur réel, connecté en Access staging, sur `/admin/media` :

- [ ] Sélectionner un fichier JPEG léger (quelques centaines de Ko à quelques Mo).
- [ ] Authorize → PUT direct → progression réelle affichée → upload-complete → statut `Prêt`.
- [ ] Le média apparaît dans la médiathèque, thumbnail visible (`/admin/media/:id/file`).
- [ ] Reload de la page → toujours présent.

**Evidence :**
```
Taille fichier :
Durée authorize (ms) :
Durée upload PUT (ms) :
Durée upload-complete/validation (ms) :
Statut final :
```

---

## 12. Upload PNG réel (§18)

Même scénario que §11, format PNG.

**Evidence :**
```
MIME détecté :
Dimensions détectées :
Preview OK (oui/non) :
```

---

## 13. Upload ~24 Mpx réel (§19-20) — OBLIGATOIRE, point critique

Utiliser une vraie image proche de 24 Mpx (ex. export JPEG/PNG d'un appareil photo réel, plusieurs Mo).

- [ ] Upload complet (authorize → PUT → complete).
- [ ] Dimensions réelles retournées correctes.
- [ ] **Aucune exception mémoire, aucun timeout côté Worker** pendant `upload-complete` (le code actuel fait `object.arrayBuffer()` pour la validation — c'est précisément ce que ce test doit confirmer acceptable en conditions réelles).

**Si l'upload échoue par timeout/mémoire/latence excessive : NE PAS bricoler silencieusement.** Documenter précisément le symptôme ci-dessous et le signaler comme blocage à traiter dans un Patch 014S-A dédié, pas comme un correctif improvisé sur staging.

**Evidence :**
```
Taille fichier (Mo) :
Dimensions :
Durée upload (s) :
Durée validation Worker (s) :
Erreur mémoire/timeout observée (oui/non, détail si oui) :
Statut final :
```

---

## 14. Multi-upload réel (§21)

- [ ] Au moins 3 fichiers simultanés (mélange JPEG/PNG).
- [ ] Un échec volontaire (ex. renommer un fichier non-image en `.jpg`) inclus dans le lot.
- [ ] Chaque fichier affiche un statut indépendant ; l'échec du fichier corrompu n'affecte pas les 2 autres.
- [ ] Aucune collision de storage key (vérifiable via la médiathèque — chaque ligne a un id/clé distincts).

**Evidence :**
```
(résultat par fichier : nom, statut final)
```

---

## 15. Fichier corrompu / MIME mismatch / size mismatch (§22-24)

- [ ] Faux `.jpg` (texte renommé) → upload R2 techniquement possible, validation serveur échoue → `failed`, jamais `ready`.
- [ ] PNG réel déclaré comme JPEG (ou inverse) → `failed`, message clair.
- [ ] Taille déclarée différente de la taille réelle (si reproductible facilement côté client, ex. via devtools) → `failed`.

**Evidence :**
```
(3 résultats, avec le message d'erreur affiché pour chacun)
```

---

## 16. Test abandon (§25)

- [ ] Authorize sans jamais uploader → ligne D1 reste `pending`.
- [ ] Déclencher le cleanup (manuel ou via un appel qui liste la médiathèque, qui appelle `cleanupAbandonedMediaAction` — voir `src/lib/admin/media-actions.ts`).
- [ ] Il est acceptable d'accélérer la fenêtre UNIQUEMENT en environnement de test (ex. insérer directement une ligne avec un `authorized_at` déjà ancien), sans changer la logique de production (`ABANDON_AFTER_MS` reste 15 min dans le code).
- [ ] Ligne passe à `abandoned`.

**Evidence :**
```
(id de la ligne, statut avant/après)
```

---

## 17. Persistance réelle (§26-27)

- [ ] Upload `ready`.
- [ ] Reload page.
- [ ] Logout Access.
- [ ] Login Access à nouveau.
- [ ] Reload.
- [ ] Média toujours visible, metadata toujours présente, objet R2 toujours présent (`/admin/media/:id/file` renvoie toujours l'image).
- [ ] Modifier alt FR/EN, focal X/Y, droits de publication + note → save → reload → toutes les valeurs persistées.

**Evidence :**
```
(confirmation de chaque étape)
```

---

## 18. Media picker CMS Travail (§28)

- [ ] Aller dans `/admin/work/new`.
- [ ] Le média fraîchement uploadé (`ready`) apparaît immédiatement dans le sélecteur, sans redéploiement ni changement de code.
- [ ] Créer un draft avec ce média, save, preview — fonctionne normalement.
- [ ] Confirmer qu'aucune modification au frontend public n'a eu lieu (le brief interdit tout branchement frontend public dans ce lot).

---

## 19. Publication rights réelles (§29-30)

- [ ] Média `ready` sans droits confirmés → draft Work autorisé, mais publication de la langue bloquée (message clair, pas de SQL brut).
- [ ] Confirmer les droits sur ce média → publication de la langue maintenant autorisée.
- [ ] **Guard de remplacement de média (validation réelle de 013A)** : sur un Work Item déjà live (langue publiée), créer un brouillon, remplacer son média par un média sans droits confirmés, tenter de publier le brouillon → doit être bloqué. Confirmer les droits sur ce nouveau média → publish maintenant accepté.

**Evidence :**
```
(résultat de chaque sous-test, avec le message d'erreur affiché quand bloqué)
```

---

## 20. Delete / restore (§31-32)

- [ ] Média non référencé → soft delete réussit → apparaît en corbeille → restore réussit.
- [ ] Média référencé par un Work Item → soft delete refusé, message d'usage visible (ex. "work_items.media_id (1)").

---

## 21. Preview sécurisé (§33)

- [ ] `/admin/media/:id/file` sans session Access → bloqué (même comportement que toute route `/admin/**`).
- [ ] Avec session Access → bon `Content-Type`, bytes réels de l'image.
- [ ] Pas de cache public observable (headers de réponse — `Cache-Control` ne doit pas indiquer un cache partagé/public).

---

## 22. Network inspection — preuve direct-to-R2 (§34) — critère d'acceptation

- [ ] Ouvrir les DevTools réseau du navigateur pendant un upload.
- [ ] Confirmer que la requête `PUT` du fichier va directement vers `https://<account>.r2.cloudflarestorage.com/...` — **jamais** vers le domaine du Worker applicatif (`admin-staging.divinemotion.ca/...`).

**Evidence :**
```
(URL exacte observée pour la requête PUT, capture/texte des devtools)
```

---

## 23. Sécurité de l'URL présignée (§35)

- [ ] Expiration courte confirmée (15 min — vérifiable via le paramètre `X-Amz-Expires` dans l'URL générée).
- [ ] Clé unique par upload (format `media/{uuid}/original.{ext}`).
- [ ] Méthode `PUT` uniquement dans la signature.
- [ ] Si testable simplement : réutiliser une URL présignée après son expiration → doit échouer côté R2 (signature expirée).
- [ ] Aucun secret (Access Key/Secret Key) visible dans l'URL elle-même ou dans les réponses JSON du Worker.

---

## 24. Logs / revue sécurité (§36)

- [ ] Examiner les logs staging (Workers Logs / `wrangler tail --env staging` pendant les tests ci-dessus).
- [ ] Confirmer l'absence de : JWT complet, URL présignée complète, secrets, credentials, PII inutile.

---

## 25. Performance (§37)

Relevés approximatifs suffisants (pas de benchmark formel) :

**Evidence :**
```
Authorize latency (ms) :
Upload duration (dépend de la taille/connexion) :
Verify (upload-complete) duration (ms) :
Admin preview (/file) duration (ms) :
```

---

## 26. Erreurs réseau (§38)

- [ ] Interrompre un upload en cours (fermer l'onglet ou couper le réseau pendant le PUT) → la ligne D1 reste `pending`, pas de corruption d'état.
- [ ] Appeler `upload-complete` avant que l'objet ne soit réellement présent dans R2 (ex. sur une ligne fraîchement autorisée) → `OBJECT_NOT_FOUND`, `failed` — comportement déjà couvert par `tests/admin/media-actions.test.ts`, à reconfirmer en conditions réelles.
- [ ] Réessai manuel (bouton "Réessayer" côté médiathèque) après un échec → relance un cycle complet propre.

---

## 27. Discipline de scope (§39-41)

- [ ] Aucune modification de code effectuée, sauf incompatibilité réelle découverte et documentée précisément ci-dessous (cause racine + proposition de patch ciblé, jamais un élargissement de scope).
- [ ] Les 200 tests locaux (`npm run lint && npm run typecheck && npm run build && npm test && npm run test:auth && npm run test:admin && npm run db:test && npm run test:cms:work && npm run test:storage && npm run test:media`) restent verts — aucun test n'a été converti en test CI utilisant de vrais secrets staging.

**Incompatibilités découvertes (s'il y en a) :**
```
(symptôme, cause racine, patch proposé — PAS appliqué directement ici)
```

---

## 28. Production untouched — confirmation finale

- [ ] Aucune ressource production créée/modifiée (D1, R2, domaine, Access, migration, secrets).
- [ ] Aucun `wrangler deploy` sans `--env staging`.
- [ ] Aucun merge vers `main`.
- [ ] `wrangler.toml` ne contient toujours aucune section `[env.production]`/`[[r2_buckets]]`/`[[d1_databases]]` production.

---

## Une fois cette checklist remplie

Transmettre ce fichier rempli (ou coller son contenu dans la conversation) à la session Claude Code — elle rédigera `REAL STAGING VALIDATION REPORT 014S` (structure exacte : §48 du Validation Brief 014S) à partir des preuves recueillies ici, tranchera **REAL CLOUDFLARE STAGING VALIDATED: YES/NO** et **READY FOR PUBLIC MEDIA DELIVERY PHASE: YES/NO**, et proposera le(s) patch(es) ciblé(s) si une incompatibilité réelle a été découverte à la section 27.
