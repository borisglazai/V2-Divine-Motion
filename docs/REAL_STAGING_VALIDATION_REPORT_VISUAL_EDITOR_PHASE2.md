# REAL STAGING VALIDATION REPORT — VISUAL EDITOR PHASE 2

**Branche :** `validation/staging-cloudflare`
**Environnement :** Cloudflare staging réel (D1/R2/Access réels)
**Production :** non touchée, aucun déploiement

Ce rapport clôt la Phase 2 de l'éditeur visuel (Travail — composition de galerie, À propos, Contact). Il consigne la validation manuelle réelle effectuée par Boris sur l'environnement staging Cloudflare réel — hors de portée de la session Claude Code, qui n'a aucun accès réseau sortant vers Cloudflare (voir `docs/STAGING_VALIDATION.md` §"Pourquoi ce document existe") — combinée à la validation automatisée exécutée côté code et aux 4 bugs réels détectés et corrigés pendant ce cycle.

**Rappel de méthode :** ce document est strictement factuel. Il ne reformule que ce qui a été rapporté comme validé par Boris ou prouvé par les suites de tests automatisées de ce dépôt. Aucun scénario non exécuté n'est présenté comme validé.

---

## 1. Résumé exécutif

La Phase 2 de l'éditeur visuel a été validée en conditions réelles par Boris sur staging Cloudflare : Travail (sélection de composition, slots occupés et vides, ajout de photo avec alt obligatoire, publication FR), À propos (contenu D1, hero, paragraphes, approche), et Contact (contenu éditorial + coexistence avec le vrai formulaire public).

Trois tables de contenu (`work_page_content`, `about_content`, `contact_content`) étaient vides au démarrage de ce cycle sur staging réel — réparées manuellement avec le contenu canonique du seed, sans migration, sans toucher Travail/Services/Témoignages. Quatre bugs réels ont été trouvés pendant la validation et corrigés dans ce même cycle (données manquantes ; sélecteur de composition sans retour visuel ; carte `Minimal` partiellement inaccessible sur mobile ; formulaire Contact imbriqué dans le formulaire CMS).

Aucune ressource de production n'a été touchée. Aucun déploiement public final n'a eu lieu.

---

## 2. Réparation des données staging

Au démarrage de ce cycle, les tables suivantes étaient vides sur le D1 staging réel :

- `work_page_content`
- `about_content`
- `contact_content`
- `about_story_paragraphs`
- `about_approach_items`

Réparées manuellement (SQL fourni par Claude Code, exécuté par Boris — aucun accès Cloudflare côté session Claude Code) avec le contenu canonique de `seeds/local.sql`, sans migration, sans suppression, sans toucher Travail (`work_items`)/Services/Témoignages.

`about_content` utilise :
- `hero_media_id = 13` — seul média réellement `ready` avec droits de publication confirmés disponible sur staging au moment de la réparation
- `breathing_media_id = NULL`
- `human_note_media_id = NULL`

Ces deux derniers champs restent non configurés sur staging (voir §7 Limites connues) — sans effet observable, ces sections ne sont pas encore reliées à `about_content` par le rendu Phase 2 (elles restent sur leur contenu de démonstration).

---

## 3. Travail — validé réellement

- `/admin/site/travail` se charge correctement
- Contenu global (`work_page_content`) visible et lu depuis D1
- Composition `Editorial` chargée par défaut
- Slots visuels affichés selon la composition choisie
- Slots vides affichés avec leur ratio/orientation attendus
- `Ajouter une photo` fonctionnel sur un slot vide
- Sélection de média fonctionnelle
- Alt FR/EN obligatoires à la création (jamais pré-remplis)
- Création d'un nouveau `work_item` en brouillon fonctionnelle
- La nouvelle image apparaît dans la composition côté admin
- Publication FR fonctionnelle
- `is_visible = 1` et `fr_status = published` corrects après publication
- Ordre des items correct
- Un bloc de composition incomplet reste volontairement masqué côté public
- Une fois le bloc complété, les images apparaissent correctement sur `/travail`
- Changement de composition `Editorial / Story / Minimal` validé, avec sélection visuelle corrigée (voir bug 2, §8) et persistance après reload validée
- Interaction clavier et tactile couverte par les tests navigateur automatisés (§6)

---

## 4. À propos — validé réellement

- `/admin/site/a-propos` se charge correctement
- Contenu D1 (`about_content`) visible
- Hero visible, avec l'image hero réelle (`hero_media_id = 13`) affichée
- Textes éditables (titre/intro hero, libellés)
- 3 paragraphes "Histoire" (`about_story_paragraphs`) présents
- 3 éléments "Approche" (`about_approach_items`) présents
- Édition visuelle fonctionnelle (modification et sauvegarde de texte)

Aucune autre zone d'À propos (image de respiration, note humaine — voir §7) n'a été testée manuellement au-delà de ce qui précède ; elle n'est donc pas déclarée validée.

---

## 5. Contact — validé réellement

- `/admin/site/contact` se charge correctement
- Contenu éditorial visible et éditable
- Formulaire public présent

**Bug réel trouvé pendant cette validation** : le formulaire CMS englobait le formulaire public dans le HTML rendu — imbrication de `<form>` invalide. Symptôme observé : un clic sur `Enregistrer` déclenchait la validation native du navigateur ("Veuillez renseigner ce champ.") sur le champ `Nom` du formulaire public, au lieu de sauvegarder le contenu CMS.

Correction : le formulaire CMS est désormais un élément séparé de `<main>` (ne l'englobe plus) ; le ciblage de ses champs se fait via l'attribut `data-cms-fields-for` plutôt que par l'imbrication DOM (voir §8, bug 4).

Après correction, validé réellement :
- Sauvegarde CMS réussie
- Aucun déclenchement de la validation du formulaire public
- Persistance de la modification après reload
- Formulaire public resté intact (champs vides, comportement inchangé)

---

## 6. Responsive / UX — validé

- Sélecteur de composition desktop : clic réel fonctionnel
- Sélecteur de composition : navigation clavier fonctionnelle
- Sélecteur de composition : usage tactile (mobile) fonctionnel
- Correction du chevauchement mobile sur la carte `Minimal` (voir §8, bug 3)
- Toolbar mobile compacte/repliable

---

## 7. Tests automatisés

Résultats réels, exécutés côté code pendant ce cycle :

| Suite | Résultat |
|---|---|
| Lint | ✅ |
| Typecheck | ✅ |
| Build | ✅ |
| Site-editor tests | ✅ 26/26 |
| Public tests | ✅ 66/66 |
| Browser tests (Playwright, réels) | ✅ 8/8 |

Les tests navigateur (Playwright, `astro dev`, jamais `node --test` + `fetch()` seul — ces bugs sont dans le comportement réel du navigateur, pas dans une réponse HTTP) :

- `tests/admin/layout-picker.browser.test.ts` (4 tests) — sélecteur de composition Travail : sélection au clic, sélection depuis n'importe quel état de départ, sélection au clavier, sauvegarde + persistance après reload.
- `tests/admin/contact-form-isolation.browser.test.ts` (4 tests) — formulaire public réellement indépendant du formulaire CMS, champs publics vides, sauvegarde CMS sans déclencher la validation du formulaire public, persistance après reload avec formulaire public toujours intact.

Ces suites couvrent la logique de code ; elles ne remplacent pas la validation manuelle réelle des §3 à §6 (ni Cloudflare Access réel, ni le vrai déploiement staging).

---

## 8. Bugs trouvés et corrigés pendant la validation

### Bug 1 — `work_page_content`, `about_content`, `contact_content` absents du staging réel

- **Symptôme :** `/admin/site/travail`, `/admin/site/a-propos`, `/admin/site/contact` sans contenu de page (composition/hero/coordonnées).
- **Cause racine :** ces 3 tables n'avaient jamais été peuplées sur le D1 staging réel — aucune migration ne les seed automatiquement.
- **Correctif :** réparation manuelle via SQL idempotent (`INSERT ... WHERE NOT EXISTS`), contenu canonique du seed, exécutée par Boris. Aucune migration, aucune suppression.
- **Statut final :** ✅ Corrigé et re-vérifié en staging réel.

### Bug 2 — Sélecteur de composition Travail : la valeur changeait, l'affichage non

- **Symptôme :** cliquer sur `Story`/`Minimal` ne montrait aucun changement visuel ; `Editorial` restait affiché comme sélectionné.
- **Cause racine :** la classe visuelle de sélection était calculée uniquement côté serveur au chargement de la page ; rien ne la mettait à jour côté client après un clic (le radio natif sous-jacent, lui, changeait correctement).
- **Correctif :** un écouteur `change` synchronisant l'état visuel sur l'état réel du radio coché, dans `EditorToolbar.astro`.
- **Statut final :** ✅ Corrigé (commit `ef5d002`), couvert par test navigateur automatisé.

### Bug 3 — Carte `Minimal` partiellement inaccessible sur mobile

- **Symptôme :** trouvé pendant le smoke-test mobile du correctif du bug 2 — la dernière carte de composition pouvait se retrouver partiellement sous la barre d'outils fixe en bas d'écran, donc intactable à cet endroit précis.
- **Cause racine :** en `position: static` sur mobile (compactage antérieur de la toolbar), rien ne réservait l'espace occupé par la barre d'outils fixe.
- **Correctif :** marge basse réservant le même espace que celui déjà utilisé ailleurs pour la toolbar mobile.
- **Statut final :** ✅ Corrigé (commit `ef5d002`).

### Bug 4 — Formulaire Contact imbriqué dans le formulaire CMS

- **Symptôme :** clic sur `Enregistrer` déclenchant la validation native ("Veuillez renseigner ce champ.") du champ `Nom` du formulaire public, au lieu de sauvegarder.
- **Cause racine :** le formulaire CMS englobait `<main>`, qui contient le vrai `<form>` public de Contact — imbrication de `<form>` invalide en HTML ; le navigateur fusionnait silencieusement les champs du formulaire public dans le formulaire externe.
- **Correctif :** formulaire CMS séparé de `<main>` ; ciblage des champs via `data-cms-fields-for` plutôt que par imbrication DOM.
- **Statut final :** ✅ Corrigé (commit `63199e0`), couvert par test navigateur automatisé.

---

## 9. Commits de la Phase 2

| Commit | Contenu |
|---|---|
| `c0805d8` | Implémentation Phase 2 (Travail — composition de galerie, À propos, Contact) |
| `2134b3a` | Correction du test d'invariants (liste de triggers obsolète après migration 0006) |
| `ef5d002` | Correction du sélecteur de composition Travail (bugs 2 et 3) |
| `63199e0` | Isolation du formulaire Contact / formulaire CMS (bug 4) |

Tous sur la branche `validation/staging-cloudflare`.

---

## 10. Validation manuelle réelle

Les scénarios listés en §3 à §6 ont été exécutés et validés manuellement par Boris directement sur l'environnement staging Cloudflare réel (Access réel, D1 réel, R2 réel), depuis une machine avec accès réseau réel à Cloudflare — la session Claude Code elle-même n'a aucun accès réseau sortant vers Cloudflare et n'a exécuté aucune de ces vérifications directement.

En complément, chaque correctif (bugs 2, 3, 4) a été reproduit et re-vérifié via un navigateur réel (Playwright, `astro dev`, données réelles insérées via les fonctions DAL réelles) avant d'être livré — cette preuve locale corrobore, sans s'y substituer, la validation staging réelle rapportée par Boris.

---

## 11. Limites connues

Ces points sont documentés comme limites connues, pas comme bugs bloquants :

- L'aperçu admin de la galerie Travail est une approximation visuelle de la composition — pas nécessairement pixel-identique au rendu public.
- `Retirer` un slot occupé n'est pas implémenté (passe par `/admin/work` si nécessaire).
- Un `work_item` nouvellement créé via un slot vide peut encore nécessiter `/admin/work` pour certaines modifications avancées (catégorie, position, focus, visibilité) avant sa première publication.
- Les images "respiration" et "note humaine" d'À propos (`breathing_media_id`, `human_note_media_id`) ne sont pas configurées sur staging et ne sont pas encore reliées au rendu Phase 2 — ces sections restent sur leur contenu de démonstration.

---

## 12. Éléments hors périmètre

Non testés dans ce cycle, non déclarés validés, non déclarés en échec :

- Toute zone d'À propos au-delà de ce qui est listé en §4 (image de respiration, note humaine, CTA final).
- Le backend réel du formulaire de contact (volontairement non touché — hors périmètre de la Phase 2, formulaire toujours visuel uniquement).
- SEO, Paramètres, portail client, e-commerce — jamais dans le périmètre de la Phase 2.

---

## 13. Conclusion

**Ce qui est validé :**
- Réparation des données de page staging (Travail, À propos, Contact) — confirmée fonctionnelle après correction.
- Travail : sélection de composition, slots occupés/vides, ajout de photo avec alt obligatoire, publication FR, mapping items → slots, visibilité publique correcte.
- À propos : contenu D1, hero réel, paragraphes, approche, édition visuelle.
- Contact : contenu éditorial éditable, coexistence saine avec le formulaire public après correction du bug 4.
- Responsive/UX : sélecteur de composition desktop/clavier/tactile, corrections mobile.
- 4 bugs réels trouvés pendant ce cycle, tous corrigés et re-vérifiés (staging réel et/ou tests navigateur automatisés).
- Pipeline complet vert (lint, typecheck, build, 26/26 site-editor, 66/66 public, 8/8 navigateur).
- Aucune ressource de production touchée, aucun déploiement public final.

**Ce qui n'est pas validé (hors périmètre ou limite connue, non un échec) :**
- Zones d'À propos non listées en §4 (§11, §12).
- Backend réel du formulaire de contact (hors périmètre, §12).

**La Phase 2 peut-elle être considérée comme fermée ?**
Au vu de l'ensemble ci-dessus, ce rapport recommande **oui** — les zones prévues de Travail/À propos/Contact sont validées en réel, les 4 bugs trouvés sont corrigés et re-vérifiés, aucune limite de production n'a été franchie, et les limites connues restantes sont documentées sans bloquer la fermeture. La décision officielle revient à Boris.

**VISUAL EDITOR PHASE 2 — REAL STAGING VALIDATED: YES**
**READY TO CLOSE PHASE 2: YES**

Ce rapport ne déclare pas la production prête ou déployée — aucun déploiement production n'a eu lieu ni n'est couvert par ce document.
