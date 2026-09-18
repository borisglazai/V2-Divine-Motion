# REAL STAGING VALIDATION REPORT — VISUAL EDITOR PHASE 3

**Branche :** `validation/staging-cloudflare`
**Environnement :** Cloudflare staging réel (D1/R2/Access)
**Production :** non touchée
**Commits principaux de la Phase 3 :** `a63b86f`, `3ce2e77`
**Rapport de livraison :** `docs/VISUAL_EDITOR_PHASE3_DELIVERY_REPORT.md`
**Clôture précédente :** `docs/REAL_STAGING_VALIDATION_REPORT_VISUAL_EDITOR_PHASE2.md` (commit `a9ca919`)

## 1. Résumé exécutif

Ce document reflète uniquement ce qui a été réellement validé manuellement en staging réel pour la Phase 3 de l'éditeur visuel (Travail uniquement), pas ce qui était seulement prévu à l'audit ou couvert par les tests automatisés. Aucune modification du produit n'a été faite pour produire ce rapport — document uniquement.

## 2. UX compacte des slots — validé réellement

Validé en staging réel :
- image mise en avant, statut discret visible (Brouillon / Publié FR / Publié EN / Publié FR + EN / Masqué)
- `Changer l'image`
- `Modifier` (ouvre le panneau replié)
- `Retirer`
- `Précédent` / `Suivant`
- champs avancés (alt FR/EN, légende, point focal, publication par langue) repliés par défaut, non visibles en permanence
- miniatures schématiques Editorial / Story / Minimal visibles dans le sélecteur de composition

L'éditeur Travail est désormais visuellement beaucoup moins "formulaire CMS" et plus proche d'une composition éditoriale directe, conformément à l'objectif de la Phase 3.

## 3. Retirer / Remettre — validé réellement

Validé en staging réel :
- `Retirer` fonctionne
- l'item passe en brouillon masqué (l'admin le voit toujours dans son emplacement, jamais un slot vidé silencieusement)
- badge `Masqué` visible côté admin immédiatement
- bouton `Remettre` apparaît à la place de `Retirer`
- le média R2 n'est **pas** supprimé — ni physiquement ni via une référence cassée
- le changement reste soumis au workflow brouillon/publication existant (un `Retirer` non publié ne retire rien du site public)

**Important :** ceci n'est en aucun cas une suppression de média. `Retirer` n'agit que sur le champ `is_visible` du `work_item`, jamais sur le fichier R2 ni sur la ligne elle-même.

## 4. Réordonnancement — validé réellement

Validé en staging réel :
- boutons `Précédent` / `Suivant` fonctionnels
- l'ordre est modifié immédiatement dans l'éditeur admin (visible dès le rechargement de la page qui suit l'action), même tant qu'il reste en brouillon
- l'ordre en brouillon est donc visible immédiatement — pas de changement interne invisible
- persistance confirmée après reload et après publication

**Bug trouvé pendant le développement (avant tout passage en staging) :** la première implémentation de `moveWorkSlotAction` réutilisait la primitive de réordonnancement global déjà existante pour `/admin/work` (`reorderWorkItemDrafts`), en lui passant l'intégralité du catalogue reclassé. Cette primitive renumérote systématiquement **tous** les identifiants qu'on lui passe en une séquence dense 1..N. Conséquence : si seuls les deux items réellement déplacés étaient publiés (cas normal d'usage), tous les autres items du catalogue se retrouvaient avec un brouillon de position ouvert mais non publié, désynchronisant l'ordre public réel dès qu'on publiait uniquement les deux items visés. Ce bug a été détecté par les tests automatisés (`tests/public/site-editor-phase3.test.ts`) avant tout déploiement staging, jamais observé en environnement réel. Correctif : `moveWorkSlotAction` échange désormais directement les valeurs de position des deux items adjacents concernés, sans toucher au reste du catalogue.

## 5. Point focal — validé réellement

Validé en staging réel :
- ouverture du panneau `Modifier`
- édition visuelle du point focal par clic dans l'aperçu
- sauvegarde
- persistance après reload
- cadrage (`object-position`) correctement réappliqué sur l'image publiée après publication

Aucun changement de schéma n'a été nécessaire (`focal_x`/`focal_y` existaient déjà sur `work_items`).

## 6. Alt depuis médiathèque — validé réellement

Validé en staging réel :
- à la création d'un nouveau slot (slot vide → "Ajouter une photo"), si le média sélectionné a déjà un alt FR/EN valide dans la médiathèque, ces valeurs sont reprises automatiquement dans les champs alt du nouvel item
- aucun alt n'est jamais inventé : si le média n'a pas d'alt, les champs restent vides et doivent être remplis par l'admin
- ce comportement s'applique **uniquement à la création** d'un nouvel item
- aucun écrasement automatique sur un item existant : changer l'image d'un slot déjà occupé ne touche jamais son alt déjà défini

## 7. Layouts — confirmé inchangé

Les trois compositions restent exactement :
- Editorial
- Story
- Minimal

Phase 3 n'a modifié ni leur structure ni leur verrouillage. Seules les images peuvent être réordonnées au sein d'un layout (via Précédent/Suivant) ; les blocs du template eux-mêmes (full/large/centered/offset/duo/trio, leur nombre et leur séquence) restent entièrement code-owned, comme avant la Phase 3.

## 8. Tests automatisés

Phase 3 a ajouté :
- 15 tests DAL / actions (`tests/public/site-editor-phase3.test.ts`) : Retirer/Remettre, réordonnancement (y compris le cas non-atomique et le cas "item jamais publié"), pertes/doublons lors des changements de layout, alt obligatoire sur un item existant, persistance du point focal
- 7 tests navigateur Playwright (`tests/admin/gallery-slot-phase3.browser.test.ts`) : reprise d'alt à la création uniquement, préservation d'alt sur "Changer l'image", point focal cliquable, activation clavier du panneau `Modifier`, confirmation de `Retirer` (annulation et confirmation), accessibilité tactile mobile

Résultats réels connus (pipeline global) :
- `npm run test:public` : 81 tests, dont les 15 nouveaux — tous passent
- `npm run test:browser` : 15 tests, dont les 7 nouveaux — tous passent
- `npm run test:cms:work`, `db:test:dal`, `db:test:migration-0003`, `test:auth`, `test:admin`, `test:cms:services`, `test:cms:testimonials`, `test:storage`, `test:media` : tous passent, aucune régression

**État réel de `npm run typecheck` (à ne pas simplifier en "✓") :**
- `npm run typecheck` retourne un **exit code `1`**
- 2 erreurs TypeScript dans `src/components/admin/EditorToolbar.astro`, fonction `fieldsRootFor` (`ts(2322)`, incompatibilité de type entre `HTMLFormElement`/`Element` et `ParentNode`)
- confirmé par `git stash` : ces 2 erreurs existaient déjà, identiques, avant toute modification de la Phase 3 — cette fonction n'a pas été touchée cette phase
- ce n'est donc **pas** une régression Phase 3, mais une dette technique préexistante, documentée explicitement ici plutôt que passée sous silence

**État réel de `db:test:invariants` (à ne pas simplifier en "✓") :**
- des exécutions lancées en concurrence avec d'autres suites lourdes ont donné des résultats variables (36/40, puis 39/40, sur le même commit, code strictement identique entre les deux exécutions)
- relance isolée (aucune autre suite en concurrence) sur HEAD (`a63b86f`/`3ce2e77`) : **40/40**
- relance isolée sur `a9ca919` (clôture Phase 2, avant toute modification Phase 3) : **40/40**
- `git diff a9ca919..a63b86f -- migrations src/lib/db` confirme qu'aucun fichier sous `migrations/` n'a été modifié ; le seul changement sous `src/lib/db` est un tri applicatif dans `work.ts` (`listWorkItemsForAdminGallery`), sans modification de schéma, trigger, ni requête DDL
- conclusion : la variabilité observée est de la flakiness environnementale liée à l'exécution concurrente de suites lourdes dans le même environnement, pas une régression introduite par la Phase 3

**Formulation correcte de l'état du pipeline** (pas "pipeline 100 % vert") :
> Aucune régression Phase 3 détectée dans les suites isolées ; le typecheck global du repo reste non vert à cause d'une erreur préexistante, non liée à la Phase 3.

## 9. Bugs / écarts trouvés pendant la Phase 3

### Bug 1 — Réordonnancement initial utilisant la mauvaise primitive globale
- **Symptôme :** en publiant uniquement les deux items intentionnellement déplacés après un `Suivant`/`Précédent`, l'ordre public réel se désynchronisait de l'ordre attendu.
- **Cause :** `moveWorkSlotAction` déléguait à `reorderWorkItemDrafts`, une primitive conçue pour `/admin/work` qui renumérote l'intégralité du catalogue passé en 1..N — trop large pour un simple échange de deux voisins.
- **Impact :** détecté et corrigé avant tout déploiement staging, par les tests automatisés ; jamais observé sur un environnement réel.
- **Correctif :** `moveWorkSlotAction` échange désormais directement les valeurs de position des deux seuls items concernés, chacun via son propre brouillon.
- **Statut :** corrigé, couvert par test (`tests/public/site-editor-phase3.test.ts`).

### Bug 2 — Ordre non reflété immédiatement dans l'éditeur admin
- **Symptôme (anticipé par l'exigence explicite de Boris) :** un réordonnancement en brouillon n'était historiquement reflété dans l'éditeur admin qu'après publication, jamais avant.
- **Cause :** `listWorkItemsForAdminGallery` triait toujours par la position **publiée**, jamais par la position effective du brouillon ouvert.
- **Impact :** UX — un changement de brouillon paraissait invisible/sans effet.
- **Correctif :** tri sur la position effective (brouillon si présent, sinon publiée) ; le rendu public (`listPublishedWorkItems`) reste inchangé, toujours basé sur la seule colonne publiée.
- **Statut :** corrigé, couvert par test.

### Bug 3 — Flakiness observée lors d'exécutions concurrentes de `db:test:invariants`
- **Symptôme :** nombre d'échecs variable (0, 1, ou 4 sur 40) entre plusieurs exécutions du même commit.
- **Cause probable :** contention de ressources (CPU/E-S) due à plusieurs suites Wrangler/Miniflare lourdes lancées en parallèle dans l'environnement de développement.
- **Impact :** aucun sur le produit — suite non liée au code de la Phase 3 (voir §8, aucune migration/trigger touché).
- **Correctif/statut :** non corrigé (hors périmètre Phase 3 — suite de tests préexistante, aucune modification du code testé) ; relances isolées donnent 40/40 de manière reproductible sur HEAD et sur `a9ca919`. Documenté comme flakiness environnementale, pas comme bug produit.

### Bug 4 — Erreur TypeScript préexistante `fieldsRootFor`
- **Symptôme :** `npm run typecheck` retourne exit code 1.
- **Cause :** incompatibilité de type TypeScript dans `EditorToolbar.astro` (`fieldsRootFor`), antérieure à la Phase 3.
- **Impact :** aucun à l'exécution (le code fonctionne, testé et validé en staging) ; seulement une erreur de vérification statique.
- **Correctif/statut :** non corrigé dans cette étape (contrainte explicite : aucune correction du typecheck dans cette clôture). Confirmé préexistant via `git stash`. Dette technique documentée, à traiter séparément.

## 10. Commits de la Phase 3

- `a63b86f` — Visual Editor Phase 3 : implémentation complète (actions, routes, `GallerySlot.astro`, `EditorToolbar.astro`, tests)
- `3ce2e77` — Ajout du rapport de livraison Phase 3 (`docs/VISUAL_EDITOR_PHASE3_DELIVERY_REPORT.md`)

## 11. Validation manuelle réelle (staging)

Réalisée sur `/admin/site/travail?lang=fr`, environnement Cloudflare staging réel (D1/R2/Access), desktop et mobile :
1. Slot occupé : vue compacte confirmée, `Modifier` ouvre le panneau, édition alt/légende/point focal, sauvegarde, publication.
2. `Précédent`/`Suivant` sur deux items adjacents : nouvel ordre visible immédiatement en brouillon, publication des deux items, ordre public confirmé.
3. `Retirer` : confirmation navigateur, badge `Masqué` immédiat, publication, disparition du site public, média toujours accessible ; `Remettre`, publication, réapparition confirmée.
4. Slot vide : `Ajouter une photo`, média avec alt existant → pré-remplissage confirmé, modification manuelle possible.
5. Changement de layout Editorial → Story → Minimal → retour : aucune image perdue, aucun doublon.
6. Répétition des points 1 à 3 sur viewport mobile : aucun contrôle masqué sous la barre d'outils fixe, tous les contrôles restent accessibles au tactile.

## 12. Limites connues

- L'aperçu admin de Travail reste une approximation CSS des proportions publiques, pas un rendu pixel-identique (limite déjà connue depuis la Phase 2, inchangée).
- L'ordre publié reste soumis au workflow brouillon/publication existant — un réordonnancement n'a d'effet public qu'après publication explicite de chaque item déplacé.
- Pas de drag & drop : la réorganisation se fait uniquement via les boutons `Précédent`/`Suivant`, choix délibéré et validé (voir l'audit Phase 3).
- Le point focal est un éditeur simple (clic pour définir le centre), pas un outil de recadrage avancé.
- Le typecheck global du dépôt n'est pas vert, à cause d'une dette technique antérieure à la Phase 3 (`fieldsRootFor`, voir §8 Bug 4).

Aucun de ces points n'est bloquant pour la validation staging de la Phase 3.

## 13. Conclusion

```
VISUAL EDITOR PHASE 3 — REAL STAGING VALIDATED: YES
READY TO CLOSE PHASE 3: YES
NO PRODUCTION DEPLOYMENT PERFORMED
```
