# Data Architecture — Divine Motion V2

**Statut :** conçu en Phase 4 (Briefs 009/009A), implémenté en fondation D1 réelle par le Brief 010, **et doté d'une couche d'accès aux données (DAL) typée par le Brief 011** — `src/lib/db/`. `migrations/0001_initial.sql` est la migration réelle et appliquée (localement, via Wrangler ; voir `docs/DEPLOYMENT.md`) ; `docs/drafts/001_initial.sql` reste comme trace du brouillon pré-implémentation. Le binding `DB` est désormais lu par du code applicatif réel (`src/lib/db/client.ts`, via `cloudflare:workers`), mais aucune page publique n'y est encore branchée — le frontend continue de lire `src/data/mock/*.ts` (voir "Data Access Layer" ci-dessous). Ce document explique le *pourquoi* du schéma ; `migrations/0001_initial.sql` est la référence exacte des colonnes/types/contraintes.

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

`services` — 3 lignes MVP au départ (Mariages/Portraits/Événements). **`layout` n'est plus une colonne D1 (Review 009A)** : les trois compositions (wide-offset/split/text-image) sont une décision de présentation frontend, associée à l'identifiant stable `slug` — voir ADR-014. `service_features` porte la liste de 2-3 puces par service. Porte le mécanisme brouillon/publié uniforme.

**Mise à jour — Services CMS.** Le schéma n'a jamais imposé de plafond à 3 lignes (aucune contrainte technique de comptage) ; le module CMS construit sur ce schéma permet d'en créer d'autres (`resolveServiceLayout`, `src/lib/service-layout.ts`, fait tourner cycliquement les 3 mêmes variantes de layout pour toute offre au-delà des 3 initiales — voir ADR-014, addendum). Deux colonnes additives (`tagline_fr`/`tagline_en`, nullables) et les 3 triggers de droits de publication manquants ont été ajoutés en `migrations/0004_services_cms.sql` — voir ADR-011, addendum.

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
4. **Réordonnancement en masse de Travail** : résolu côté brouillon par la Review 011A (`reorderWorkItemDrafts` — voir "Data Access Layer" ci-dessous), qui ne modifie jamais les lignes publiées. Reste ouvert : l'UX/orchestration d'une publication groupée et atomique de plusieurs items réordonnés (un bouton « publier le réordonnancement » qui serait tout-ou-rien) — délibérément non construite en Phase 5, à concevoir dans le futur Brief CMS.

*(Le layout Travail/Services et le stockage des soumissions Contact, précédemment listés ici, sont désormais des décisions verrouillées — voir ADR-014, ADR-015.)*

## Risks

- **Mis à jour (Review 011A)** : le réordonnancement de plusieurs `work_items` en une session passe par plusieurs brouillons (`reorderWorkItemDrafts`), publiés ensuite un par un — voir "Data Access Layer" ci-dessous. La publication groupée n'est pas atomique entre items ; l'orchestration d'une publication groupée atomique reste à concevoir dans le futur Brief CMS, pas un blocage du schéma.
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

---

## Data Access Layer (Implementation Brief 011)

`src/lib/db/` — SQL explicite, pas d'ORM. Un fichier par entité (`media.ts`, `work.ts`, `services.ts`, `testimonials.ts`, `pages.ts`, `settings.ts`, `seo.ts`) au-dessus d'un moteur générique partagé (`publish.ts`, `snapshots.ts`) qui porte le SEUL mécanisme brouillon/publié (ADR-013) — chaque entité l'appelle plutôt que de le réimplémenter. Toute fonction reçoit `db: D1Database` en premier paramètre (jamais un singleton global) ; le seul endroit qui lit le binding réel est `client.ts` (`import { env } from "cloudflare:workers"`, la seule API supportée par `@astrojs/cloudflare` 14.x/Astro 6 — `Astro.locals.runtime.env` a été retiré).

### Convention d'erreurs

`Result<T, DbError> = { ok: true, data: T } | { ok: false, error: DbError }` pour toute issue métier attendue (`NOT_FOUND`, `DRAFT_ALREADY_EXISTS`, `NO_DRAFT`, `PUBLICATION_RIGHTS_REQUIRED`, `INVALID_STATE`, `VALIDATION_FAILED`). Une erreur SQL/réseau inattendue continue de lever une exception — elle n'entre pas dans ce modèle, il n'y a rien de significatif à en faire au niveau appelant au-delà de la journaliser.

### `status` vs `fr_status`/`en_status` — deux leviers séparés

Décision structurante de cette couche : `publishDraft()` (le mécanisme brouillon → publié) **ne touche jamais** `fr_status`/`en_status`. Ces colonnes sont gérées exclusivement par `setLanguageStatus()`, une action directe sur la ligne publiée. Raison : conflater les deux aurait fait d'une simple bascule « publier la version FR » une opération de copie de contenu complète (snapshot, enfants, etc.), alors que ce sont deux actions de nature différente — éditer un contenu en sécurité, et rendre une langue visible. C'était initialement pensé comme le seul point où le garde-fou de droits de publication (ADR-011) s'applique côté application : `setWorkItemLanguageStatus`/`setTestimonialLanguageStatus` vérifient `media.publication_rights_confirmed` avant d'écrire, renvoyant `PUBLICATION_RIGHTS_REQUIRED` plutôt que de laisser le trigger D1 lever une erreur SQL brute. **Ce n'est plus le seul point depuis CMS Work Patch 013A — voir la sous-section suivante.** Le trigger D1 reste actif et reste le dernier rempart, dans les deux cas.

### Publication rights — remplacement de média sur une ligne déjà live (CMS Work Patch 013A)

**Le bug.** `publishWorkItem()` copiait le `media_id` du brouillon sur la ligne publiée sans aucune vérification de droits. Scénario : un `work_item` publié avec `fr_status='published'` ; un brouillon ouvert dont le `media_id` est changé vers un média sans droits confirmés ; publication du brouillon → `media_id` copié sur la ligne publiée, `fr_status`/`en_status` restent inchangés (`published`, déjà valides avant cette opération). Les triggers `BEFORE UPDATE OF fr_status/en_status` (ADR-011) ne se déclenchent jamais pour cette écriture — elle ne touche pas ces colonnes — donc un média sans droits confirmés pouvait devenir visible publiquement sans qu'aucun garde-fou existant ne s'y oppose. Une violation réelle d'ADR-011, pas juste un trou de couverture de test.

**Correction DAL.** `publishWorkItem()` (`src/lib/db/work.ts`) prend désormais un `preflight` (même mécanisme que `setLanguageStatus`, réutilisé sans modifier `publish.ts`) : si le brouillon remplace une ligne publiée existante (`draft_of_id` non nul) ET que cette ligne a déjà FR ou EN `published`, le média du brouillon doit avoir `publication_rights_confirmed = 1`, sinon `PUBLICATION_RIGHTS_REQUIRED` est renvoyé avant toute écriture SQL — la ligne publiée reste inchangée, le brouillon est conservé. Un élément neuf (`draft_of_id IS NULL`) ou une ligne publiée dont aucune langue n'est encore live reste publiable sans droits confirmés : ce garde-fou protège ce qui deviendrait visible, jamais la curation elle-même.

**Défense D1 (dernier rempart).** `migrations/0002_publication_rights_media_change_guard.sql` ajoute deux triggers `BEFORE UPDATE OF media_id`/`photo_media_id` (sur `work_items`/`testimonials` respectivement), restreints à `status = 'published'` ET (`fr_status='published'` OU `en_status='published'`) — jamais aux lignes brouillon, où changer de média doit toujours rester libre (une ligne brouillon peut porter une copie obsolète de `fr_status`/`en_status` héritée de son parent au moment de sa création ; sans cette restriction explicite à `status='published'`, le trigger bloquerait à tort l'édition normale d'un brouillon). `testimonials.photo_media_id` est couvert par le même principe alors même qu'aucun CMS Témoignages n'existe encore (Brief 013A §4) — l'invariant D1 est corrigé maintenant, le CMS suivra plus tard.

### Réordonnancement (`reorderWorkItemDrafts`) — corrigé en Review 011A

**Décision initiale renversée.** L'implémentation Brief 011 écrivait `position` directement sur les lignes `status='published'`, en la traitant comme `fr_status`/`en_status` (un levier de curation, pas la prose que *Save Draft ≠ Publish* protège). La Review 011A a identifié que ce raisonnement était faux pour l'ordre de Travail : contrairement au statut de langue (qui ne fait qu'afficher/masquer un contenu déjà publié), l'ordre EST une donnée publique directement visible sur le site — un réordonnancement dans l'admin ne doit donc jamais changer ce que le public voit avant un Publish explicite. `reorderWorkItems` a été supprimé, pas réinterprété sous le même nom.

`reorderWorkItemDrafts(db, orderedPublishedIds, updatedBy?)` le remplace et n'écrit plus jamais que sur des lignes brouillon : pour chaque id publié de la liste, elle réutilise le brouillon déjà ouvert s'il existe, ou en crée un (`createDraftFromPublished`) sinon — un brouillon manquant est donc créé plutôt que de faire échouer l'appel, mais aucune ligne publiée n'est jamais modifiée par cette fonction, quelle que soit la situation. Une validation `SELECT COUNT(*)` préalable rejette l'ensemble si un id de la liste n'est pas une ligne publiée existante, avant toute écriture.

Publier le nouvel ordre reste une étape **séparée et explicite**, par item (`publishWorkItem(db, draftId)` pour chaque id retourné) — ce n'est PAS orchestré par `reorderWorkItemDrafts`.

**Limitation documentée, non contournée (Review 011A) : pas d'atomicité entre plusieurs items publiés.** `publishDraft` est atomique par item (un seul `batch()` — voir Transactions D1 ci-dessous), mais publier N items réordonnés reste N appels séparés, donc N transactions indépendantes. Un crash entre deux publications laisse un ordre partiellement appliqué réellement visible côté public (certains items dans leur nouvelle position, d'autres non). Garantir une publication tout-ou-rien sur un ensemble arbitraire d'items demanderait une nouvelle primitive (table d'orchestration publish-batch, ou extension de `db.batch()` à travers plusieurs lignes de plusieurs tables à la fois) que cette couche ne construit délibérément pas maintenant — c'est de l'orchestration niveau CMS, explicitement laissée au futur Brief CMS, pas inventée silencieusement ici.

**Confirmé côté CMS (Implementation Brief 013).** Le premier consommateur réel de `reorderWorkItemDrafts` — `POST /admin/work/reorder`, via `src/lib/admin/work-actions.ts`'s `reorderWorkItemsAction` — respecte cette limitation par construction plutôt que de tenter de la contourner : l'UI (boutons Monter/Descendre) réordonne uniquement les brouillons, puis chaque élément déplacé se publie séparément depuis la liste (bouton « Publier » par ligne). Le message de confirmation après un réordonnancement le dit explicitement à l'admin. Toujours pas de mécanisme de publication groupée — la décision reste : Brief CMS futur, pas ce brief (Brief 013 §20-21, choix explicite de l'option « reorder draft-safe + publication item par item » plutôt qu'une infrastructure de batch).

`src/lib/db/work.ts` gagne un petit accesseur : `getWorkItemDraft(db, publishedId)` (enveloppe fine de `getDraftOf` de `publish.ts`) — le CMS a besoin de résoudre « ce published a-t-il déjà un brouillon ouvert ? » sans dupliquer de SQL en dehors de la DAL ; ne change rien au moteur générique.

### Transactions D1 (confirmé empiriquement contre `worker-configuration.d.ts` généré et contre un vrai D1 local)

`D1Database` n'expose que `prepare().bind().first/run/all()` et `batch(statements[])` — pas de `BEGIN`/`COMMIT`, pas de transaction interactive. `batch()` exécute un tableau FIXE de requêtes préparées de façon atomique (tout ou rien) ; aucune requête du tableau ne peut dépendre du résultat d'une requête précédente **du même appel**.

- **`publishDraft` est entièrement atomique** : l'id du brouillon et l'id de la ligne publiée sont déjà connus avant de commencer, donc l'instantané, la mise à jour de la ligne publiée, le remplacement des enfants et la suppression du brouillon sont un seul `batch()`.
- **`createDraftFromPublished`/`createNewDraft` ne le sont PAS entièrement** quand l'entité a des enfants : la nouvelle ligne brouillon doit d'abord être insérée (via `INSERT ... RETURNING id`, confirmé fonctionnel sur D1 local) pour connaître son id avant de pouvoir copier ses enfants avec cet id comme parent — deux allers-retours, pas un seul `batch()`. La fenêtre entre les deux laisse brièvement un brouillon sans ses enfants. Compromis assumé et documenté (pas un ADR : n'affecte aucune décision de schéma, seulement l'implémentation) pour un CMS mono-admin à faible concurrence.
- Un `UPDATE`/`DELETE` qui ne touche 0 ligne n'est PAS une erreur SQL — `reorderWorkItemDrafts` valide donc l'existence (et le statut `published`) de toutes les lignes par un `SELECT COUNT(*)` avant d'écrire quoi que ce soit, pour éviter qu'un id invalide dans la liste laisse les autres brouillons se créer/modifier partiellement.

### Enfants (`service_features`, `services_approach_steps`, `about_story_paragraphs`, `about_approach_items`)

Stratégie « remplacer entièrement » (`DELETE` puis `INSERT...SELECT`), jamais de diff ligne à ligne — simple, correct, entièrement atomique dans le `batch()` de publication. Testé explicitement (`tests/dal/dal.test.ts`) : modifier les enfants d'un brouillon ne change jamais les enfants de la ligne publiée avant une publication explicite.

### Snapshots

`publish.ts` construit l'instantané à partir des seules `copyColumns` déclarées (jamais `SELECT *`), l'insère comme statement du même `batch()` que la publication (atomique avec elle), puis élague au-delà des 5 derniers **après** que le batch ait validé (`pruneOldSnapshots`, non atomique avec l'insertion — un crash entre les deux laisse au pire un instantané surnuméraire, jamais un instantané perdu).

### Tests

`tests/dal/dal.test.ts` (32 tests) tourne contre un vrai D1 local — pas `node:sqlite`, pas de mémoire jetable — via l'API Node de Miniflare (`Miniflare.getD1Database()`), le même mécanisme que `wrangler d1 execute` utilise en interne. Contrairement à la suite d'invariants du Brief 010 (qui shell-out vers `wrangler d1 execute` par requête, ~2s/appel), cette suite appelle directement les fonctions TypeScript de la DAL en process — ~11s pour 32 tests contre ~220s pour 27. Les fichiers `.ts` de test tournent via `tsx` (nouvelle devDependency) : le support natif de Node 22 pour TypeScript exige des imports relatifs avec extension explicite (`./types.ts`), incompatible avec la convention sans extension déjà en place dans tout le reste du code — `tsx` résout ce problème sans toucher au style d'import du code source.

### Smoke test runtime (`src/pages/dev-d1-smoke-test.json.ts`)

Prouve que le binding `DB` atteint réellement un handler de requête vivant (pas seulement les commandes Wrangler CLI) : `curl http://localhost:.../dev-d1-smoke-test.json` sous `astro dev` renvoie `{"binding":"DB","reachable":true,"query_result":{"ok":1}}` ; la même route sous `astro build && astro preview` (mode production) renvoie `404` — le garde-fou `import.meta.env.DEV` fonctionne. Les fichiers `src/pages/` commençant par `_`/`__` sont exclus du routage par Astro (pas seulement masqués) — cette route utilise donc un préfixe `dev-` plutôt que l'underscore, avec le garde-fou runtime comme véritable protection.

---

## Media upload lifecycle (Implementation Brief 014)

`migrations/0003_media_upload_lifecycle.sql` ajoute `media.authorized_at` (nullable, simple `ADD COLUMN` — 0001/0002 restent immuables). Décision complète, y compris l'option rejetée empiriquement (rendre `uploaded_at` nullable) et pourquoi : `docs/decisions/ADR-017-r2-direct-upload-lifecycle.md`.

**Résumé applicatif.** `media.processing_status` (déjà `pending/uploaded/ready/failed/abandoned` depuis 0001/009A) a désormais un cycle réellement piloté par `src/lib/db/media.ts` :

- `createMediaMetadata` — `pending`, pose `authorized_at` **et** un `uploaded_at` provisoire (même valeur) — jamais NULL, jamais un mensonge, juste "pas encore confirmé".
- `markMediaUploaded` — `pending → uploaded`, uniquement une fois l'objet R2 confirmé présent (`HEAD`), écrase `uploaded_at` avec l'horodatage réel.
- `markMediaReady` — `uploaded → ready` uniquement (resserré depuis Brief 011 : n'accepte plus `pending`), pose `width`/`height` réels.
- `markMediaFailed` — accessible depuis n'importe quel état non terminal.
- `abandonStalePendingMedia(db, olderThanMs)` — cleanup réutilisable (pas de Cron Trigger dans ce lot), `pending` → `abandoned` sur la base de `authorized_at`.

Ce fichier reste strictement métadonnées : la composition avec R2 (génération de clé, URL présignée, vérification réelle de l'objet) vit dans `src/lib/storage/` (`keys.ts`, `r2-presign.ts`, `image-inspect.ts`, `env.ts`, `media-storage.ts`), jamais dans `src/lib/db/media.ts` lui-même — voir `docs/MEDIA_ARCHITECTURE.md` pour cette couche.

**Tests.** `tests/db/invariants.test.mjs` (colonne `authorized_at` nullable, `uploaded_at` toujours `NOT NULL`) ; `tests/db/migration-0003-sequencing.test.mjs` (apply frais 0001+0002+0003, ré-application idempotente, upgrade depuis une base n'ayant que 0001+0002 avec vérification du backfill) ; `tests/admin/media-actions.test.ts` (cycle complet JPEG/PNG/24 Mpx, multi-upload, corruption, MIME/taille mensongères, abandon, suppression bloquée si utilisé — contre un vrai D1 + R2 Miniflare).

---

## Éditeur visuel Phase 1 — `home_content` rejoint le garde-fou de droits (`migrations/0005_home_content_rights_gate.sql`)

Avant ce brief, `home_content` (Brief 011) n'avait aucun chemin de publication publique réel — le site public n'en lisait jamais l'image hero. L'éditeur visuel Phase 1 (`/admin/site`, voir `docs/CMS_SPEC.md`/`docs/decisions/ADR-018-visual-editor-architecture.md`) rend `hero_media_id` réellement éditable et affichable publiquement, ce qui active pour la première fois le même trou de sécurité qu'ADR-011 avait déjà fermé pour `work_items`/`services`/`testimonials` (0001/0002) et `services` (0004) : un média sans droits confirmés pourrait devenir visible publiquement via une simple mise à jour de contenu (sans passer par le chemin `publish` déjà gardé).

`0005_home_content_rights_gate.sql` ajoute exactement le même triptyque de triggers que `0004_services_cms.sql`, scopé à `home_content` uniquement :

- `trg_home_content_rights_gate_fr` / `_en` — bloque le passage de `fr_status`/`en_status` à `published` si l'un des 3 médias référencés (`hero_media_id`, `editorial_media_id`, `about_preview_media_id`) n'a pas `publication_rights_confirmed = 1`.
- `trg_home_content_rights_gate_{hero_media,editorial_media,about_preview_media}_change` — bloque le remplacement d'un de ces médias sur une ligne déjà en ligne (`status='published' AND (fr_status='published' OR en_status='published')`) par un média sans droits confirmés.

`about_content`/`contact_content` ont les mêmes colonnes média mais toujours aucun chemin de publication réel (audit seulement, Phase 1 du brief) — délibérément non couverts par cette migration ; à traiter quand (et si) un chemin de publication réel leur est ouvert.

Côté DAL, `src/lib/db/pages.ts`'s `pageRepo()` gagne un second paramètre `mediaFields: readonly string[]` (même rôle que le préflight applicatif de `publishWorkItem`/`publishService`/`publishTestimonial`) et une méthode `setLanguageStatus()` sur l'objet retourné — `home_content` est le premier appelant à passer des `mediaFields` non vides.
