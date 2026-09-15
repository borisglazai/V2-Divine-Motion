# Data Architecture — Divine Motion V2

**Statut :** conception Phase 4 (Implementation Brief 009), révisée suite à la revue **DATA ARCHITECTURE REVIEW 009A**. Design uniquement — aucune migration D1 exécutée, aucune base créée. Le schéma concret et exécutable (draft, non appliqué) est dans `docs/drafts/001_initial.sql`. Ce document explique le *pourquoi* ; le SQL est la référence exacte des colonnes/types/contraintes.

**Décisions verrouillées par la Review 009A** (voir ADR-013, ADR-014, ADR-015) : mécanisme brouillon/publié unique pour tout contenu public éditable (`work_items`/`services`/`testimonials` inclus, plus de règle hybride) ; aucune colonne `layout`/`blockType` en D1 pour Travail ou Services ; aucune table de soumission de contact.

## Principes retenus

- **Contenu structuré et typé partout** (ADR-004) : aucune table de contenu vivant ne porte de blob JSON générique. La seule exception, délibérée et étroite, est `content_snapshots.snapshot_json` — un filet de sécurité de restauration, jamais une source de rendu.
- **Pas de modèle Projects** (ADR-003) : `work_items` reste une curation de médias, pas des fiches projet.
- **FR/EN par colonnes dénormalisées** (ADR-007) : `_fr`/`_en` sur chaque table de contenu, jamais de table de traduction générique. Publication indépendante par langue partout où c'est pertinent (`fr_status`/`en_status`).
- **Brouillon ≠ publié**, de façon explicite et jamais accidentelle.
- **Droits de publication** au niveau média, garde-fou technique à la publication (ADR-011).
- **Optimisé pour la simplicité et la lisibilité**, pas pour un volume qui n'existera jamais à cette échelle (MVP : dizaines de médias, ~10-30 `work_items`, 3 `services`, une poignée de `testimonials`).

## ERD (texte)

```text
media
  ├── work_items.media_id            (RESTRICT)
  ├── services.media_id              (RESTRICT)
  ├── testimonials.photo_media_id    (RESTRICT, nullable)
  ├── home_content.hero_media_id            (RESTRICT)
  ├── home_content.editorial_media_id       (RESTRICT, nullable)
  ├── home_content.about_preview_media_id   (RESTRICT, nullable)
  ├── about_content.hero_media_id           (RESTRICT)
  ├── about_content.breathing_media_id      (RESTRICT, nullable)
  ├── about_content.human_note_media_id     (RESTRICT, nullable)
  └── page_seo.og_media_id                  (SET NULL, nullable)

services
  └── service_features.service_id    (CASCADE)

-- Brouillon/publié (Review 009A) : mécanisme UNIQUE, appliqué à TOUT
-- contenu public éditable — plus de règle hybride.
work_items ─┐
services ─┤
testimonials ─┤  chacune : draft_of_id → soi-même (CASCADE)
home_content ─┤  (au plus 1 brouillon par ligne publiée,
work_page_content ─┤   index unique partiel sur draft_of_id)
services_page_content ─┤
about_content ─┤
contact_content ─┘

services_page_content
  └── services_approach_steps.services_page_id   (CASCADE)

about_content
  ├── about_story_paragraphs.about_id    (CASCADE)
  └── about_approach_items.about_id      (CASCADE)

work_items.featured_on_home = 1  ──►  dérive la "Selected Work" de l'accueil
services (is_active, position)   ──►  dérive la "Services Preview" de l'accueil
site_settings (contact_email, instagram_url) ──► dérive "Coordonnées" de Contact

content_snapshots  : référence lâche (entity_type, entity_key) — pas de FK ;
                     couvre désormais aussi work_items/services/testimonials
page_seo.page_key  : 'home'|'work'|'services'|'about'|'contact'|'privacy'
site_settings       : singleton (id = 1)

-- Pas de table pour le formulaire de contact (Review 009A) — voir §26.
```

## Media model

`media` — métadonnées uniquement, jamais le binaire (R2 le stocke, D1 le référence). Cycle d'upload (`processing_status`) : `pending → uploaded → ready`, ou `failed`/`abandoned` — **`processing` retiré (Review 009A)** : aucune étape de transformation asynchrone réelle n'existe au MVP (Cloudflare Images/Resizing transforment à la livraison, pas à l'upload), donc pas d'état qu'aucun code ne positionnerait jamais. Droits de publication portés ici (voir ADR-011). Soft delete via `deleted_at`. Aucune URL CDN stockée — dérivée de `storage_key` au rendu. Détail complet : `docs/drafts/001_initial.sql`.

## Work model

`work_items` — curation, pas un catalogue. Pas de colonne `layout`/`block_type` : la composition (full/centered/large/offset/duo) est calculée par le frontend à partir de la position, du nombre d'éléments et de la bande de ratio (large/carré/portrait) de chaque image — **décision verrouillée**, voir ADR-014. `featured_on_home` remplace la liste séparée `workPreview.items` du mock actuel : l'accueil affiche un sous-ensemble de `work_items`, pas une seconde curation parallèle. Porte le mécanisme brouillon/publié uniforme — voir « Draft/Publish strategy ».

## Services model

`services` — exactement 3 lignes MVP. **`layout` n'est plus une colonne D1 (Review 009A)** : les trois compositions (wide-offset/split/text-image) sont une décision de présentation frontend, associée à l'identifiant stable `slug` — voir ADR-014. `service_features` porte la liste de 2-3 puces par service. Porte le mécanisme brouillon/publié uniforme.

## Testimonials model

`testimonials` — modèle simple, pas de système d'avis. Photo optionnelle ; soft-deletable (retirer un témoignage est une action éditoriale réversible normale — uniquement pertinent sur la ligne publiée, pas sur un brouillon). Porte le mécanisme brouillon/publié uniforme.

## Page content model

Cinq tables dédiées (`home_content`, `work_page_content`, `services_page_content`, `about_content`, `contact_content`), une par page publique **sauf Confidentialité** (exclue délibérément — voir « Confidentialité : hors modèle CMS pour le contenu »). Chacune porte le mécanisme de brouillon protecteur (voir « Draft/Publish »). Les listes de longueur variable propres à une page (paragraphes d'À propos, étapes d'Approche) vivent dans de petites tables enfants typées, jamais dans des colonnes JSON.

## Site settings

Table singleton typée (`id = 1`), pas de clé/valeur : le nombre de paramètres est petit et fixe (email, Instagram, nom de marque, zone de service optionnelle, SEO par défaut). Un modèle clé/valeur n'aurait de sens que pour un ensemble de paramètres nombreux/dynamique, ce qui n'est pas le cas ici.

## SEO model

`page_seo`, une ligne par page connue (y compris Confidentialité : les métadonnées SEO sont du balisage, pas du contenu juridique). `og_media_id` en `SET NULL` (perdre l'image OG d'une page ne doit jamais bloquer la suppression d'un média par ailleurs légitime).

## FR/EN strategy

Colonnes `_fr`/`_en` partout (ADR-007). Statut de publication **par langue**, pas un statut unique partagé : `fr_status`/`en_status` (+ `fr_published_at`/`en_published_at`) sur chaque table de contenu publiable. Nécessaire concrètement pour `work_items` : si la légende EN d'une image n'est pas prête, cette image doit disparaître de la page Travail EN tout en restant visible en FR — un statut partagé ne pourrait pas exprimer ça.

## Draft / Publish strategy

**Décision (verrouillée par la Review 009A, voir ADR-013) : un mécanisme unique, appliqué à tout contenu public éditable — `work_items`, `services`, `testimonials`, et les 5 tables de contenu de page.** L'hybride proposé initialement (statut simple pour les entités courtes, ligne brouillon uniquement pour le contenu de page) a été explicitement rejeté : *Save Draft ≠ Publish* s'applique sans exception, y compris à une légende `work_item` ou à un titre `service`.

Mécanisme (identique partout) : chaque table publiable porte `status` (`'draft'` | `'published'`) et `draft_of_id` (auto-référence, nullable). La ligne `status = 'published'` est la seule que le site public lit ; au plus une ligne `status = 'draft'` peut exister par ligne publiée (`draft_of_id`, index unique partiel). Modifier un élément déjà publié crée (ou réutilise) sa ligne brouillon — copie de départ des valeurs publiées — et n'édite jamais la ligne publiée directement. « Publier » copie les colonnes du brouillon sur la ligne publiée dans une transaction, puis supprime le brouillon. Un tout nouvel élément (jamais publié) est simplement créé `status = 'draft'`, `draft_of_id = NULL`, et devient `status = 'published'` en place lors de sa première publication (rien à copier, pas de ligne publiée préexistante).

`fr_status`/`en_status` restent distincts de `status` : `status` dit si CETTE ligne est la version publiée ou un brouillon en attente ; `fr_status`/`en_status` (sur la ligne publiée) disent si chaque langue est prête/live. Les deux mécanismes se combinent sans redondance : un brouillon peut être en cours d'édition en FR seulement, et sa publication ne touchera que `fr_status` au moment de la copie.

**Nouveau compromis assumé — réordonnancement de Travail.** Un réordonnancement (drag-and-drop de plusieurs `work_items`) passe, à la lettre de la règle, par autant de paires brouillon/publication que d'éléments déplacés. Le schéma le permet nativement sans changement : l'action « Publier ce réordonnancement » de l'admin peut copier plusieurs brouillons vers leurs lignes publiées respectives **dans une seule transaction** — c'est une question de logique applicative (Phase 5), pas une limite du schéma. Signalé en Risques ci-dessous plutôt que traité en silence.

## Preview strategy

La prévisualisation lit la ligne `status = 'draft'` (quand elle existe) au lieu de la ligne publiée — même composants de rendu que le site public (WYSIWYG réel, Master Brief section 33), simplement alimentés par la ligne brouillon. Le site public, lui, ne lit **jamais** une ligne `status = 'draft'` — sur aucune table, sans exception (Review 009A). Aucun rendu spécial « mode preview » à maintenir séparément.

## Versioning / Rollback

Pas de Git pour le contenu, pas de table de révisions complète. `content_snapshots` : un instantané JSON contrôlé des colonnes de l'entité, pris automatiquement juste avant chaque publication, conservé pour les N (recommandé : 5) dernières publications par entité puis purgé. **Étendu (Review 009A)** à `work_items`/`services`/`testimonials` au même titre qu'aux 5 tables de contenu de page, puisque ces trois entités passent désormais elles aussi par une vraie action de publication à instantanéiser. Sert un seul usage : permettre à un humain de restaurer manuellement un état antérieur après une publication problématique — ce n'est pas un historique consultable dans l'admin au MVP.

## Publication rights

Voir `docs/decisions/ADR-011-publication-rights-model.md`. Résumé : confirmé une fois au niveau `media`, appliqué à chaque publication (`work_items`, `testimonials` avec photo) par trigger D1.

## Soft delete

Seulement où utile : `media` (corbeille), `testimonials` (retrait éditorial réversible — `deleted_at` n'a de sens que sur la ligne publiée ; abandonner un brouillon est une suppression physique de cette ligne brouillon, pas un soft delete). Explicitement pas sur `work_items` (retirer une curation n'est que supprimer la ligne de jointure — le média protégé reste intact), ni sur `services`/tables de contenu de page (lignes fixes, jamais supprimées).

## IDs / timestamps

Voir `docs/decisions/ADR-012-d1-id-timestamp-conventions.md`. `INTEGER PRIMARY KEY AUTOINCREMENT` partout (sauf `page_seo.page_key`, clé naturelle). Timestamps en millisecondes Unix, `INTEGER`.

## Foreign keys

Résumées dans l'ERD ci-dessus. Règle générale : `RESTRICT` pour tout média qui est le contenu principal d'un usage (Travail, Services, Témoignage, héros de page) — une suppression physique ne doit jamais pouvoir casser silencieusement une page ; `SET NULL` pour un usage secondaire/cosmétique (image OG) ; `CASCADE` pour les relations parent→enfant internes à une même entité où l'enfant n'a aucun sens sans son parent — puces de service, paragraphes/items d'À propos, étapes d'approche Services, **et désormais (Review 009A) `draft_of_id` sur `work_items`/`services`/`testimonials` en plus des 5 tables de contenu de page** : supprimer une ligne publiée supprime proprement son éventuel brouillon orphelin.

## Indexes

Un index par colonne réellement interrogée en pratique : position (tri d'affichage), `fr_status`/`en_status` (filtrage public), `media_id` (jointures), `deleted_at`/`processing_status` (médiathèque), `featured_on_home` (accueil), l'index unique partiel « un seul brouillon par ligne publiée » sur `work_items`/`services`/`testimonials` et les 5 tables de contenu de page (plus « une seule ligne publiée » pour ces 5 dernières, singletons), l'index unique partiel `services.slug` restreint aux lignes publiées (un brouillon partage légitimement le `slug` de sa ligne publiée), et l'index de purge de `content_snapshots`. Aucun index « au cas où ».

## Migration strategy

`docs/drafts/001_initial.sql` est un brouillon d'audit, pas une migration prête à exécuter. Une fois validé : `migrations/0001_initial.sql`, immuable après application, jamais modifiée rétroactivement — toute correction ultérieure est une nouvelle migration numérotée. Testée en local puis staging avant toute application en production.

## Seeds

Seed local et seed staging à partir d'un jeu de données proche des mocks frontend actuels (adapté au schéma réel), pour permettre un développement/test réalistes. Aucun seed destructif en production — production ne reçoit que de vraies données saisies par l'admin, jamais un script de remplacement.

## Staging / Production separation

D1 et R2 strictement séparés par environnement (ADR-009), jamais partagés, jamais fusionnés — cohérent avec le choix `INTEGER AUTOINCREMENT` (ADR-012) : les ids ne sont uniques que par base, jamais comparés/fusionnés entre environnements.

## R2/D1 relationship

D1 = métadonnées. R2 = fichier. Cloudflare Images (ou Image Resizing — décision encore ouverte, ADR-005) = transformations/livraison. `media.storage_key` est le seul pont entre les deux ; aucune URL dérivée n'est stockée en dur.

## Orphan media policy

Un média jamais utilisé (aucune ligne ne le référence) n'est jamais supprimé automatiquement — juste signalé comme « non utilisé » dans la médiathèque (état calculé à la volée, jamais stocké, pour ne jamais devenir obsolète). La suppression reste une décision humaine (soft delete), suivie de la période de rétention puis de la purge physique automatique — qui doit elle-même revérifier l'absence de référence avant toute suppression physique réelle (double garde-fou, au cas où une référence serait apparue entre le soft delete et la purge).

## Privacy minimization

Aucune table du schéma ne contient de donnée personnelle de visiteur du formulaire de contact — voir « Contact submissions » ci-dessous, révisé par la Review 009A.

## Contact submissions — stocker ou non

**Décision (verrouillée par la Review 009A, voir ADR-015) : aucune table D1.** Le brouillon initial proposait une table technique minimale (`contact_submission_log`, sans PII) pour l'anti-abus et l'observabilité ; la Review 009A la retire explicitement du schéma MVP. Flux : `formulaire → validation → Turnstile → envoi email transactionnel → observabilité`, où « observabilité » se fait désormais entièrement via les logs/alertes du Worker (Master Brief section 58), pas via une table D1. Aucune soumission, aucune IP, aucun hash d'IP n'est stocké en D1. Conséquence assumée, inchangée dans son principe : si l'email transactionnel échoue et que la surveillance ne le détecte pas, le message du visiteur est réellement perdu — c'est le risque que l'alerting Worker doit couvrir, pas une donnée à conserver « au cas où ».

## Travail : layout frontend vs CMS

**Décision verrouillée (Review 009A, ADR-014) : Option 1.** Le CMS/D1 ne contrôle que la sélection, l'ordre, la catégorie et le contenu (légendes, alt, point focal, ratio) de chaque `work_item` ; le frontend calcule seul la composition (quel bloc — full/centered/large/offset/duo — à quelle position), de façon déterministe, à partir de la position dans la séquence, du nombre total d'éléments, et de la bande de ratio de l'image. **Aucune colonne `layout`/`block_type` en D1** — ni sur la ligne publiée, ni sur son brouillon.

**Pourquoi.** Conforme au principe produit « contenu ≠ design » (Master Brief 7.6) : le rythme de composition appartient au design system, pas à une décision au cas par cas dans l'admin. Élimine aussi un risque concret : un admin qui choisirait un `block_type` incompatible avec le ratio réel d'une photo (ex. `centered` sur une image très large) produirait un rendu cassé — l'algorithme ne peut pas faire cette erreur puisqu'il tient compte du ratio.

## Services : layout frontend vs CMS

**Décision verrouillée (Review 009A, ADR-014) : `layout` retiré de D1.** Contrairement au brouillon initial (qui proposait de garder `layout` comme colonne réelle non éditable), la Review 009A tranche : les trois compositions (wide-offset/split/text-image) sont des décisions de présentation frontend, jamais du contenu — elles vivent en code, associées à l'identifiant stable `slug` de chaque service (ex. une table de correspondance `SERVICE_LAYOUT_BY_SLUG` dans le frontend). `services` ne porte donc aucune colonne `layout`. Le `slug` reste en D1 car il EST du contenu identifiant (stable, référencé), pas une décision de présentation.

## Séparation D1 / frontend — réaffirmée (Review 009A)

Principe explicite, applicable à toute décision future du même type, pas seulement Travail/Services : **D1 stocke le contenu ; le frontend stocke les décisions de présentation non éditables.** Une donnée appartient à D1 si et seulement si un humain doit pouvoir la changer sans redéploiement (texte, sélection, ordre, référence média, statut). Une donnée qui décrit uniquement *comment* le design system doit afficher un contenu — et que l'admin n'a explicitement pas le droit de modifier (Visual Editor Spec : « ce que l'admin ne peut pas faire ») — reste dans le code, même si elle est techniquement « données » au sens large. `layout` (Services), le calcul de composition (Travail), et plus généralement tout mapping fixe clé→présentation suivent cette règle par défaut.

## Confidentialité : hors modèle CMS pour le contenu

Pas de table `page_content` pour Confidentialité dans ce schéma. Le brief le permettait « éventuellement, pour certains champs non juridiques » — je recommande de ne rien y toucher au MVP : le contenu reste piloté par le code/mock comme aujourd'hui (Brief 007), avec sa mise en garde déjà explicite (« à confirmer avant mise en production »). Seule exception : `page_seo` couvre Confidentialité comme toute autre page (le balisage SEO n'est pas un texte juridique).

## Schema tests

Retestés en SQLite jetable après la Review 009A (voir `docs/drafts/001_initial.sql` et le rapport PATCH 009A) :
- Migration : `001_initial.sql` s'applique proprement sur une base vide.
- Foreign keys : `RESTRICT` bloque la suppression physique d'un `media` référencé ; `og_media_id` passe à `NULL` sans bloquer la suppression d'un média seulement référencé par `page_seo`.
- Unique constraints : `services.slug` unique parmi les lignes publiées uniquement (un brouillon partage le `slug` de sa ligne publiée) ; un seul brouillon par ligne publiée sur `work_items`/`services`/`testimonials` et les 5 tables de contenu de page.
- Publication : les triggers `trg_*_rights_gate_*` bloquent/autorisent correctement selon `media.publication_rights_confirmed` ; un `testimonial` sans photo publie sans blocage.
- **Draft/publish — testé explicitement pour `work_items`** (pas seulement le contenu de page) : modifier un item déjà publié via son brouillon ne change jamais la lecture publique (`status='published'`) avant l'action de publication explicite ; après publication, la lecture publique reflète le brouillon et le brouillon est supprimé.
- FR/EN : publication FR réussie pendant que EN reste `draft` sur la même ligne publiée.
- Media upload state : `processing_status` rejette `'processing'`, accepte `'uploaded'`.
- Absence : `contact_submission_log` n'existe pas ; `services.layout` n'existe pas.

Reste à couvrir en Phase 5 (contre un vrai D1, pas seulement SQLite jetable) : `PRAGMA foreign_keys` réellement actif sur la connexion D1 de production ; soft delete d'un média utilisé et purge physique refusée tant qu'une référence existe ; invariants `focal_x`/`focal_y`/enum sur des données réelles en volume.

## Open questions

1. **Cloudflare Images vs Image Resizing** (ADR-005) : reste ouvert, hors du périmètre pur schéma D1 — impact budgétaire/opérationnel non tranché ici.
2. **Vidéo** : `media.media_type` reste restreint à `'image'` au MVP (confirmé hors scope par la Review 009A) — aucun pipeline vidéo choisi, signalé explicitement.
3. **Rétention de `content_snapshots`** : recommandé 5 instantanés par entité, désormais aussi pour `work_items`/`services`/`testimonials` — nombre à confirmer, pas une contrainte technique dure.
4. **Réordonnancement en masse de Travail** : le schéma supporte une publication multi-lignes en une transaction, mais l'UX exacte (publier chaque déplacement séparément vs un bouton « publier le réordonnancement ») reste à définir en Phase 5 — voir Risks.

*(Le layout Travail/Services et le stockage des soumissions Contact, précédemment listés ici, sont désormais des décisions verrouillées — voir ADR-014, ADR-015.)*

## Risks

- **Nouveau (009A)** : le réordonnancement de plusieurs `work_items` en une session passe maintenant par plusieurs paires brouillon/publication. Le schéma le permet (transaction multi-lignes), mais l'ergonomie CMS exacte n'est pas conçue ici — à traiter en Phase 5, pas un blocage du schéma.
- Les triggers de droits de publication dépendent de `PRAGMA foreign_keys`/triggers réellement actifs sur chaque connexion D1 — à vérifier explicitement en test contre un vrai D1 (voir Schema tests), pas supposé.
- Le calcul algorithmique de composition Travail est un pari UX, maintenant verrouillé sans donnée `layout` de secours : à valider visuellement avec un vrai volume de photos réelles avant la Phase 6 (contenu réel).
- Sans table de log de contact, la seule protection contre un échec silencieux d'envoi d'email est l'alerting Worker (Master Brief §58) — aucun filet de sécurité en base pour un lead perdu.

## ADR to create/update

- **Créées (Brief 009)** : `ADR-011-publication-rights-model.md`, `ADR-012-d1-id-timestamp-conventions.md`.
- **Créées (Review 009A)** : `ADR-013-uniform-draft-publish.md`, `ADR-014-work-services-presentation-ownership.md`, `ADR-015-no-contact-submission-storage.md`.
- **Mises à jour** : `ADR-003` (point ouvert résolu), `docs/CMS_SPEC.md`, `docs/MEDIA_ARCHITECTURE.md`, `docs/MASTER_BRIEF.md` (notes de supersession), `docs/ROADMAP.md` (état Phase 4).
- **Toujours non verrouillé** : rien — la Review 009A ferme les dernières décisions structurantes que le rapport 009 avait laissées en recommandation. Seules restent les questions hors périmètre schéma (Cloudflare Images vs Resizing, vidéo).

## Documentation modified

`docs/CMS_SPEC.md`, `docs/MEDIA_ARCHITECTURE.md`, `docs/MASTER_BRIEF.md`, `docs/ROADMAP.md`, `docs/decisions/ADR-003-curated-work-vs-project-model.md`, ce document, et les cinq nouvelles ADR (011 à 015).

## Recommendation

Le modèle applique désormais un mécanisme brouillon/publié unique et sans exception, conforme à *Save Draft ≠ Publish*, verrouille la séparation D1/frontend pour Travail et Services, retire le stockage de soumissions de contact, et simplifie le cycle d'upload média. Toutes les décisions structurantes que le rapport 009 avait laissées en recommandation sont désormais verrouillées par ADR. Aucune implémentation D1 n'a été faite.

**DATA MODEL READY FOR IMPLEMENTATION: YES** — sous réserve de la Phase 5 traitant les points listés en Open Questions/Risks (ergonomie du réordonnancement en masse, tests contre un vrai D1) comme des tâches d'implémentation, pas comme des inconnues de schéma.
