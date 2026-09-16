# REAL STAGING VALIDATION REPORT 014S

**Branche :** `validation/staging-cloudflare`
**Date :** 2026-09-16
**Statut proposé :** Brief 014S clôturable (décision finale à Boris — voir §13).

Ce rapport clôt la Validation Brief 014S. Il consigne la validation manuelle réelle effectuée par Boris sur l'environnement staging Cloudflare réel (D1/R2/Access réels — hors de portée de la session Claude Code, qui n'a aucun accès réseau sortant vers Cloudflare, voir `docs/STAGING_VALIDATION.md` §"Pourquoi ce document existe"), combinée à la validation automatisée exécutée côté code (232 tests, pipeline complet vert) et aux 4 bugs réels détectés et corrigés pendant ce cycle.

**Rappel de méthode :** ce document est strictement factuel. Il ne reformule que ce qui a été rapporté comme validé par Boris ou prouvé par les suites de tests automatisées de ce dépôt. Aucun scénario non exécuté n'est présenté comme validé.

---

## 1. Résumé exécutif

L'environnement staging Cloudflare (Access, D1, R2) est opérationnel et a été validé en conditions réelles par Boris : authentification admin réelle, upload de médias réel (JPEG, PNG, multi-upload, haute résolution ~24 Mpx, rejet correct au-delà de 52 428 800 octets), cycle de vie `pending → ready`, persistance réelle (reload, déconnexion/reconnexion Access), droits de publication, CMS Travail (sélection, tri, miniatures, preview, publication FR/EN), et connexion réelle du frontend public (`/travail`, `/en/work`) au CMS avec image R2 publiée visible et persistante.

Deux bugs préexistants (tri du sélecteur média, miniatures cassées) avaient déjà été corrigés avant ce cycle de validation (`54da4d7`, `2956e76`). Deux bugs supplémentaires ont été trouvés pendant la validation staging et corrigés dans ce cycle : la preview admin Travail affichait encore le placeholder, et la publication d'un Travail n'avait aucun effet visible côté public (le frontend public n'était pas connecté au CMS). Les deux sont corrigés dans le commit `e055f26`, avec une nouvelle route média publique sécurisée (jamais un accès public direct au bucket R2).

Aucune ressource de production n'a été touchée. Aucun déploiement public final n'a eu lieu.

---

## 2. Environnement validé

| Élément | Statut |
|---|---|
| Cloudflare Access (staging) | Fonctionnel en réel — login admin validé |
| Authentification admin réelle | Validée (JWT Access réel vérifié en conditions réelles) |
| D1 staging | Opérationnel en réel |
| R2 staging | Opérationnel en réel |
| Déploiement | Staging uniquement — aucun déploiement production |

---

## 3. Ressources Cloudflare utilisées

Identifiants réels tels que committés dans `wrangler.toml` `[env.staging]` au fil de ce cycle (commits `c602013`, `78091c8`, `5151ff1`, `7030de6`, `ba3ec5a`, `c9e47c6`, `ce232d3`) :

| Ressource | Identifiant |
|---|---|
| D1 staging (binding `DB`) | `divine-motion-v2-staging` (`database_id: de8bf99e-45c2-407a-b435-52148b379bf2`) |
| R2 staging (binding `MEDIA`) | `divine-motion-v2-media-staging` |
| R2 Account ID | `80690274479b4a7f525a8d4c768404bf` |
| KV Session (binding `SESSION`) | namespace existant réutilisé (`e3be4efe99f745acb0b2ac8be5a230d2`) |
| Cloudflare Access — Team Domain | `red-dream-564c.cloudflareaccess.com` |
| Cloudflare Access — Audience (AUD) | posé via `CF_ACCESS_AUD`, corrigé en `ce232d3` ("use Worker Access audience") |

Aucune section `[env.production]` / ressource production n'a été ajoutée à `wrangler.toml` pendant ce cycle — confirmé par lecture directe du fichier au moment de ce rapport.

---

## 4. Scénarios de test exécutés

Scénarios exécutés en réel par Boris sur staging, dans la continuité de la checklist `docs/STAGING_VALIDATION.md` (sections 7 à 22 de cette checklist) :

1. Authentification Access (login réel, session)
2. D1 staging — connectivité et disponibilité réelles
3. R2 staging — connectivité et disponibilité réelles
4. Upload direct-to-R2 — JPEG léger
5. Upload direct-to-R2 — PNG
6. Upload multiple (5 fichiers en un lot)
7. Upload haute résolution (~24 Mpx)
8. Rejet fichier surdimensionné (> 52 428 800 octets — la limite du code)
9. Cycle de statut `pending → ready`
10. Aperçu média réel (admin)
11. Persistance média après reload
12. Persistance après déconnexion/reconnexion Access
13. Persistance des métadonnées média
14. Droits de publication média (confirmation, blocage sans droits)
15. CMS Travail — sélection de média
16. CMS Travail — tri des médias confirmés en priorité
17. CMS Travail — miniatures réelles dans le picker
18. Preview admin Travail avec image réelle
19. Publication FR
20. Publication EN
21. `/travail` relié au CMS réel
22. `/en/work` relié au CMS réel
23. Image R2 publiée visible côté public
24. Persistance côté public après reload

---

## 5. Résultats par scénario

Tous les scénarios listés en §4 sont rapportés **validés** par Boris en conditions réelles. Le détail brut (codes HTTP observés, durées, captures) n'a pas été transmis sous forme de preuves collées dans `docs/STAGING_VALIDATION.md` (les blocs "Evidence" du fichier restent à l'état de modèle) — la validation a été communiquée directement, scénario par scénario, comme repris ci-dessus en §4/§10. Ce rapport ne reformule donc pas de métriques précises (latences, tailles exactes) qui n'ont pas été fournies ; il consigne uniquement le résultat pass/fail rapporté pour chacun.

| Scénario | Résultat |
|---|---|
| 1–3 (Access, D1, R2 opérationnels) | ✅ Validé |
| 4–8 (upload JPEG/PNG/multi/24 Mpx/rejet > 50 Mo) | ✅ Validé |
| 9–13 (statut, aperçu, persistance, métadonnées) | ✅ Validé |
| 14 (droits de publication) | ✅ Validé |
| 15–18 (CMS Travail : sélection, tri, miniatures, preview) | ✅ Validé — après correctifs (voir §6) |
| 19–20 (publication FR/EN) | ✅ Validé |
| 21–24 (frontend public relié au CMS, image publique, persistance) | ✅ Validé — après correctif (voir §6) |

---

## 6. Bugs détectés

Quatre bugs réels ont été détectés au fil de cette validation (les deux premiers avant l'ouverture formelle de ce cycle de staging, les deux derniers pendant) :

1. **Ordre du sélecteur média (CMS Travail) incorrect** — les médias aux droits confirmés pouvaient être enterrés sous des uploads plus récents non confirmés.
   Cause : tri `created_at DESC` sans priorité aux droits confirmés.
2. **Miniatures noires dans le sélecteur média** (`MediaPickerField.astro`).
   Cause : `src="/mock/placeholder.svg"` encore codé en dur, jamais mis à jour depuis le Brief 013.
3. **Preview admin Travail affichant encore un placeholder** (`/admin/work/[id]/preview`).
   Cause : même régression que le bug 2, non appliquée à cette route précise — la donnée média (R2 réel, `ready`, droits confirmés) était correcte, seul le HTML pointait vers l'asset statique fictif.
4. **Publication d'un Travail sans aucun effet visible côté public.**
   Cause : `/travail` et `/en/work` étaient encore des pages statiques (`prerender = true`), alimentées par un mock (`workMock`), jamais par D1 — le mécanisme de publication CMS (D1) fonctionnait réellement, mais rien en aval ne le consommait.

---

## 7. Correctifs appliqués

1. Priorité aux médias aux droits confirmés dans le tri du sélecteur, sans en exclure les non confirmés (toujours sélectionnables, publication bloquée séparément).
2. Remplacement du placeholder codé en dur par la vraie URL de fichier média dans `MediaPickerField.astro`.
3. Même correctif appliqué à `/admin/work/[id]/preview.astro` (réutilise la fonction déjà validée `mediaFileUrl()`).
4. Connexion réelle du frontend public au CMS :
   - `travail.astro` et `en/work.astro` passés de `prerender = true` (statique) à `prerender = false` (rendu serveur par requête, lit l'état D1 réel) ;
   - nouvelle route publique **`/media/:id/file`**, distincte et séparée de la route admin `/admin/media/:id/file` (jamais réutilisée pour le public), avec sa propre logique d'autorisation en temps réel (`resolvePublicMediaObject`) : le média doit être `ready`, non supprimé, droits de publication confirmés **et** réellement référencé par un Travail publié, visible, et dont la langue demandée est publiée. Aucun bucket R2 rendu public.

---

## 8. Commits correspondants

| Bug | Commit |
|---|---|
| 1. Tri du sélecteur média | `54da4d7` |
| 2. Miniatures cassées | `2956e76` |
| 3. Preview admin placeholder + 4. Publication sans effet public | `e055f26` |

Tous sur la branche `validation/staging-cloudflare`.

---

## 9. Tests automatisés associés

Pipeline complet exécuté côté code (lint, typecheck, build, D1 local, DAL, CMS Travail, storage, média, public) : **232 tests, 0 échec**.

Tests directement liés aux bugs de ce cycle :
- 2 tests de tri du sélecteur média (bug 1)
- Tests d'intégration `/admin/work/new` et `/admin/work/[id]` pour les vraies miniatures (bug 2)
- 2 tests d'aperçu admin (`tests/admin/work-endpoints.test.ts`) prouvant que `/admin/work/[id]/preview` résout une vraie URL média, jamais le placeholder (bug 3)
- 7 tests purs de l'adaptateur galerie (`tests/public/work-gallery-adapter.test.ts`)
- 11 tests d'autorisation de la route média publique (`tests/public/public-media.test.ts`) — y compris : refus d'un média non utilisé publiquement, refus si droits révoqués après publication (défense en profondeur, aucun trigger D1 ne couvre ce cas), refus d'un média supprimé, refus si l'objet R2 est absent
- 4 tests end-to-end publication → visibilité publique (`tests/public/work-view.test.ts`) — y compris l'exclusion d'un brouillon jamais publié, l'exclusion d'un item `is_visible = 0`, et le blocage de la publication si les droits média ne sont pas confirmés
- 1 test HTTP confirmant que `/travail` et `/en/work` sont bien rendus côté serveur (`tests/admin/routes.test.mjs`)

Ces suites couvrent la logique de code ; elles ne remplacent pas la validation manuelle réelle en §10 (ni le binding D1/R2 réel, ni Cloudflare Access réel, ni un vrai navigateur contre le vrai déploiement staging).

---

## 10. Validation manuelle réelle

Les 24 scénarios listés en §4 ont été exécutés et validés manuellement par Boris directement sur l'environnement staging Cloudflare réel (Access réel, D1 réel, R2 réel), depuis une machine avec accès réseau réel à Cloudflare — la session Claude Code elle-même n'a aucun accès réseau sortant vers Cloudflare (voir `docs/STAGING_VALIDATION.md`) et n'a exécuté aucune de ces vérifications directement.

En complément, une preuve navigateur réel a été effectuée côté code (dev local, données réelles insérées via les fonctions DAL réelles, image JPEG réelle, publication réelle) confirmant que l'aperçu admin et la page publique Travail rendent bien l'image réelle — voir le rapport de correction livré pour le commit `e055f26`. Cette preuve locale corrobore, sans s'y substituer, la validation staging réelle rapportée par Boris.

---

## 11. Éléments hors périmètre

Les modules suivants ont été vus mais sont **volontairement hors périmètre** de la Validation Brief 014S — non implémentés, non testés, **non échoués** :

- Services (module en préparation)
- Témoignages (module en préparation)
- Modifier le site (module en préparation)

Aucune conclusion de validité ou d'échec ne s'applique à ces modules dans ce cycle.

---

## 12. Risques résiduels éventuels

- **Couverture CI du chemin positif Cloudflare Access.** La suite HTTP automatisée (`tests/admin/routes.test.mjs`) ne prouve que le chemin négatif (JWT absent/invalide → bloqué) ; le chemin positif (JWT Access réel → accès admin) n'est reproductible qu'en conditions réelles, jamais en CI (aucune application Access réelle n'y est accessible). Ce chemin vient d'être confirmé manuellement en staging (§10) ; il reste néanmoins non automatisable tel quel.
- **Détail brut des preuves.** `docs/STAGING_VALIDATION.md` reste avec ses blocs "Evidence" à l'état de modèle (non remplis avec captures/logs bruts) ; la validation a été rapportée par Boris scénario par scénario plutôt que collée dans ce fichier. Aucun impact sur la validité du résultat, mais aucune trace détaillée (latences exactes, réponses HTTP brutes) n'est conservée dans le dépôt pour un futur audit.
- **Modules hors périmètre (§11)** restent entièrement à construire — non un risque de régression, mais un périmètre non couvert par cette clôture.

---

## 13. Conclusion

**Ce qui est validé :**
- Cloudflare Access, D1 staging, R2 staging réels — opérationnels et validés en conditions réelles.
- Cycle de vie complet de l'upload média réel (JPEG, PNG, multi-upload, ~24 Mpx, rejet correct au-delà de 52 428 800 octets, `pending → ready`, persistance, droits de publication).
- CMS Travail (sélection, tri, miniatures, preview) et publication FR/EN — y compris les 4 bugs détectés pendant ce cycle, tous corrigés et re-vérifiés.
- Frontend public réellement connecté au CMS (`/travail`, `/en/work`), image R2 publiée visible et persistante côté public, via une route média publique dédiée et sécurisée — aucun bucket R2 rendu public, aucune route admin réutilisée côté public, Cloudflare Access toujours en place.
- Aucune ressource de production touchée, aucun déploiement public final.

**Ce qui n'est pas validé (hors périmètre, non un échec) :**
- Services, Témoignages, Modifier le site — non implémentés dans ce Brief.

**Le Brief 014S peut-il être considéré comme clôturé ?**
Au vu de l'ensemble ci-dessus, ce rapport recommande **oui** — les 24 scénarios prévus sont validés en réel, les 4 bugs trouvés sont corrigés et couverts par des tests automatisés, la sécurité (Access, séparation admin/public, bucket non public) est confirmée intacte, et aucune limite de production n'a été franchie. La décision officielle de clôture revient à Boris.

**REAL CLOUDFLARE STAGING VALIDATED: YES**
**READY FOR PUBLIC MEDIA DELIVERY PHASE: YES**
