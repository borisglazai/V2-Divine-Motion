# Data Architecture — Divine Motion V2

**Statut :** conception Phase 4 (Implementation Brief 009). Design uniquement — aucune migration D1 exécutée, aucune base créée. Le schéma concret et exécutable (draft, non appliqué) est dans `docs/drafts/001_initial.sql`. Ce document explique le *pourquoi* ; le SQL est la référence exacte des colonnes/types/contraintes.

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

home_content ─┐
work_page_content ─┤  chacune : draft_of_id → soi-même (CASCADE)
services_page_content ─┤            (au plus 1 brouillon par ligne publiée,
about_content ─┤             index unique partiel)
contact_content ─┘

services_page_content
  └── services_approach_steps.services_page_id   (CASCADE)

about_content
  ├── about_story_paragraphs.about_id    (CASCADE)
  └── about_approach_items.about_id      (CASCADE)

work_items.featured_on_home = 1  ──►  dérive la "Selected Work" de l'accueil
services (is_active, position)   ──►  dérive la "Services Preview" de l'accueil
site_settings (contact_email, instagram_url) ──► dérive "Coordonnées" de Contact

content_snapshots        : référence lâche (entity_type, entity_key) — pas de FK
contact_submission_log   : autonome, aucune FK
page_seo.page_key        : 'home'|'work'|'services'|'about'|'contact'|'privacy'
site_settings             : singleton (id = 1)
```

## Media model

`media` — métadonnées uniquement, jamais le binaire (R2 le stocke, D1 le référence). Cycle d'upload (`processing_status`) : `pending → uploaded → processing → ready`, ou `failed`/`abandoned`. Droits de publication portés ici (voir ADR-011). Soft delete via `deleted_at`. Aucune URL CDN stockée — dérivée de `storage_key` au rendu. Détail complet : `docs/drafts/001_initial.sql`.

## Work model

`work_items` — curation, pas un catalogue. Pas de colonne `layout`/`block_type` : la composition (full/centered/large/offset/duo) est calculée par le frontend à partir de la position, du nombre d'éléments et de la bande de ratio (large/carré/portrait) de chaque image — voir « Travail : layout frontend vs CMS » ci-dessous. `featured_on_home` remplace la liste séparée `workPreview.items` du mock actuel : l'accueil affiche un sous-ensemble de `work_items`, pas une seconde curation parallèle.

## Services model

`services` — exactement 3 lignes MVP. `layout` est une colonne réelle (le frontend en a besoin pour le rendu) mais n'est pas exposée à l'édition dans le Visual Editor — voir « Services : layout frontend vs CMS ». `service_features` porte la liste de 2-3 puces par service.

## Testimonials model

`testimonials` — modèle simple, pas de système d'avis. Photo optionnelle ; soft-deletable (retirer un témoignage est une action éditoriale réversible normale).

## Page content model

Cinq tables dédiées (`home_content`, `work_page_content`, `services_page_content`, `about_content`, `contact_content`), une par page publique **sauf Confidentialité** (exclue délibérément — voir « Confidentialité : hors modèle CMS pour le contenu »). Chacune porte le mécanisme de brouillon protecteur (voir « Draft/Publish »). Les listes de longueur variable propres à une page (paragraphes d'À propos, étapes d'Approche) vivent dans de petites tables enfants typées, jamais dans des colonnes JSON.

## Site settings

Table singleton typée (`id = 1`), pas de clé/valeur : le nombre de paramètres est petit et fixe (email, Instagram, nom de marque, zone de service optionnelle, SEO par défaut). Un modèle clé/valeur n'aurait de sens que pour un ensemble de paramètres nombreux/dynamique, ce qui n'est pas le cas ici.

## SEO model

`page_seo`, une ligne par page connue (y compris Confidentialité : les métadonnées SEO sont du balisage, pas du contenu juridique). `og_media_id` en `SET NULL` (perdre l'image OG d'une page ne doit jamais bloquer la suppression d'un média par ailleurs légitime).

## FR/EN strategy

Colonnes `_fr`/`_en` partout (ADR-007). Statut de publication **par langue**, pas un statut unique partagé : `fr_status`/`en_status` (+ `fr_published_at`/`en_published_at`) sur chaque table de contenu publiable. Nécessaire concrètement pour `work_items` : si la légende EN d'une image n'est pas prête, cette image doit disparaître de la page Travail EN tout en restant visible en FR — un statut partagé ne pourrait pas exprimer ça.

## Draft / Publish strategy

**Décision : hybride assumé, pas une règle unique partout.**

- **`work_items` / `services` / `testimonials`** — un seul jeu de colonnes (`fr_status`/`en_status` = draft/published/archived) sur la ligne elle-même. Ce sont des contenus courts et atomiques (une légende, un titre, 2-3 puces), généralement modifiés et validés en un seul geste ; le risque de « publication à moitié modifiée » y est faible, et dupliquer la ligne pour un brouillon serait une complexité disproportionnée par rapport au contenu protégé.
- **Les 5 tables de contenu de page** (`home_content` & consorts) — modèle B (ligne brouillon séparée) : la ligne `status = 'published'` est celle rendue publiquement ; au plus une ligne `status = 'draft'` peut exister par ligne publiée (`draft_of_id`, index unique partiel). Modifier revient à créer/éditer la ligne brouillon ; « Publier » copie ses colonnes sur la ligne publiée dans une transaction, puis vide/supprime le brouillon. C'est précisément le scénario que le brief redoute (une session d'édition longue, plusieurs champs de prose) — le protège nativement, sans jamais exposer un état intermédiaire au public.

Une règle unique partout aurait été soit dangereuse (statut simple partout : une page à moitié éditée pourrait fuiter), soit disproportionnée (ligne brouillon partout : une simple correction de faute dans une légende `work_item` n'a pas besoin d'un mécanisme de copie/transaction).

## Preview strategy

La prévisualisation lit la ligne `status = 'draft'` (quand elle existe) au lieu de la ligne publiée — même composants de rendu que le site public (WYSIWYG réel, Master Brief section 33), simplement alimentés par la ligne brouillon. Aucun rendu spécial « mode preview » à maintenir séparément.

## Versioning / Rollback

Pas de Git pour le contenu, pas de table de révisions complète. `content_snapshots` : un instantané JSON contrôlé des colonnes de l'entité, pris automatiquement juste avant chaque publication, conservé pour les N (recommandé : 5) dernières publications par entité puis purgé. Sert un seul usage : permettre à un humain de restaurer manuellement un état antérieur après une publication problématique — ce n'est pas un historique consultable dans l'admin au MVP.

## Publication rights

Voir `docs/decisions/ADR-011-publication-rights-model.md`. Résumé : confirmé une fois au niveau `media`, appliqué à chaque publication (`work_items`, `testimonials` avec photo) par trigger D1.

## Soft delete

Seulement où utile : `media` (corbeille), `testimonials` (retrait éditorial réversible). Explicitement pas sur `work_items` (retirer une curation n'est que supprimer la ligne de jointure — le média protégé reste intact), ni sur `services`/tables de contenu de page (lignes fixes, jamais supprimées).

## IDs / timestamps

Voir `docs/decisions/ADR-012-d1-id-timestamp-conventions.md`. `INTEGER PRIMARY KEY AUTOINCREMENT` partout (sauf `page_seo.page_key`, clé naturelle). Timestamps en millisecondes Unix, `INTEGER`.

## Foreign keys

Résumées dans l'ERD ci-dessus. Règle générale : `RESTRICT` pour tout média qui est le contenu principal d'un usage (Travail, Services, Témoignage, héros de page) — une suppression physique ne doit jamais pouvoir casser silencieusement une page ; `SET NULL` pour un usage secondaire/cosmétique (image OG) ; `CASCADE` uniquement pour les relations parent→enfant internes à une même entité (ligne brouillon, puces de service, paragraphes/items d'À propos, étapes d'approche Services) où l'enfant n'a aucun sens sans son parent.

## Indexes

Un index par colonne réellement interrogée en pratique : position (tri d'affichage), `fr_status`/`en_status` (filtrage public), `media_id` (jointures), `deleted_at`/`processing_status` (médiathèque), `featured_on_home` (accueil), les deux index uniques partiels par table de contenu de page (une seule ligne publiée, un seul brouillon par ligne publiée), et l'index de purge de `content_snapshots`/`contact_submission_log`. Aucun index « au cas où ».

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

`contact_submission_log` ne stocke jamais nom, courriel, téléphone, message ou date/lieu soumis — seulement des métadonnées techniques non identifiantes (voir section dédiée ci-dessous et `docs/drafts/001_initial.sql`). Aucune autre table du schéma ne contient de donnée personnelle de visiteur.

## Contact submissions — stocker ou non

**Décision : ne pas stocker.** Conforme au principe de minimisation du Master Brief (section 20) : `formulaire → validation → Turnstile → backend → email transactionnel`, sans persistance du contenu. `contact_submission_log` existe uniquement pour l'anti-abus et l'observabilité (est-ce que l'email est parti ? Turnstile a-t-il validé ? y a-t-il un pic anormal de soumissions ?), avec des colonnes strictement non identifiantes (`ip_hash` salé, jamais l'IP brute) et une rétention courte purgée automatiquement. Conséquence assumée : si l'email transactionnel échoue et que la surveillance ne le détecte pas, le message du visiteur est réellement perdu — c'est exactement le risque que le Master Brief section 58 demande de couvrir par de l'alerting, pas par la rétention de données.

## Travail : layout frontend vs CMS

**Option recommandée : Option 1 affinée** — le CMS ne contrôle que la sélection, l'ordre et le ratio/point focal de chaque `work_item` ; le frontend calcule la composition (quel bloc — full/centered/large/offset/duo — à quelle position) de façon déterministe, à partir de la position dans la séquence, du nombre total d'éléments, et de la bande de ratio de l'image (un 21/9 ou 16/9 se prête naturellement à `full`/`offset`, un 4/5 à `centered`/`large`).

**Pourquoi.** Conforme au principe produit « contenu ≠ design » (Master Brief 7.6) : le rythme de composition appartient au design system, pas à une décision au cas par cas dans l'admin. Ça élimine aussi un risque concret : un admin qui choisirait un `block_type` incompatible avec le ratio réel d'une photo (ex. `centered` sur une image très large) produirait un rendu cassé — l'algorithme ne peut pas faire cette erreur puisqu'il tient compte du ratio. `work_items` n'a donc pas de colonne `layout`.

**Compromis assumé.** L'admin perd la possibilité de forcer explicitement « cette photo doit être en pleine largeur ». Influence indirecte conservée : le choix de la photo et de son ratio de recadrage (que l'admin contrôle) oriente la composition. **Ce point reste une recommandation à valider, pas verrouillé par ADR** — voir Questions ouvertes.

## Services : layout frontend vs CMS

**Analyse demandée « même logique que Travail », conclusion différente, justifiée.** Contrairement à Travail (séquence de longueur variable, rythme algorithmique), Services est un ensemble fixe de 3 éléments dont la variété visuelle (wide-offset / split / text-image) est une décision de design délibérée par élément, pas un rythme à calculer sur une liste qui grandit. Je recommande donc de **garder `layout` comme colonne réelle** sur `services` (le frontend en a besoin pour le rendu, et le garder en donnée plutôt qu'en `if/else` sur le `slug` reste conforme à ADR-004/« contenu structuré ») **mais de ne jamais l'exposer à l'édition** dans le Visual Editor (fixée au seed, modifiable seulement via une migration de données si le design change) — cohérent avec Visual Editor Spec : « ce que l'admin ne peut pas faire : modifier la mise en page ».

## Confidentialité : hors modèle CMS pour le contenu

Pas de table `page_content` pour Confidentialité dans ce schéma. Le brief le permettait « éventuellement, pour certains champs non juridiques » — je recommande de ne rien y toucher au MVP : le contenu reste piloté par le code/mock comme aujourd'hui (Brief 007), avec sa mise en garde déjà explicite (« à confirmer avant mise en production »). Seule exception : `page_seo` couvre Confidentialité comme toute autre page (le balisage SEO n'est pas un texte juridique).

## Schema tests

À couvrir avant toute implémentation réelle (Phase 5) :
- Migration : `001_initial.sql` s'applique proprement sur une base vide, de façon idempotente si rejouée sur une base déjà à jour (échec propre, pas de corruption).
- Foreign keys : `PRAGMA foreign_keys` réellement actif sur la connexion D1 utilisée (test explicite, pas une supposition) ; une tentative de suppression physique d'un `media` référencé par `work_items`/`services`/`testimonials`/un `*_content` échoue (`RESTRICT`) ; la suppression d'un `media` seulement référencé par `page_seo.og_media_id` réussit et met `og_media_id` à `NULL`.
- Unique constraints : `media.storage_key`, `services.slug`, index partiels « une seule ligne publiée »/« un seul brouillon » par table de contenu de page.
- Publication : les triggers `trg_*_rights_gate_*` bloquent bien un passage à `published` (FR et EN indépendamment) quand `media.publication_rights_confirmed = 0`, et l'autorisent quand `= 1` ; un `testimonial` sans photo publie sans blocage.
- Draft/publish : créer un brouillon (`draft_of_id`) sur une table de contenu de page, le modifier, vérifier que la ligne publiée est inchangée ; publier, vérifier que la ligne publiée reflète le brouillon et que le brouillon est nettoyé.
- Suppressions : soft delete d'un `media` utilisé (vérifier qu'il disparaît de la médiathèque/du rendu public sans casser les lignes qui le référencent) ; purge physique refusée tant qu'une référence existe encore.
- Invariants : `focal_x`/`focal_y` hors 0-100 rejetés ; un `status`/`processing_status`/`layout` hors des valeurs `CHECK` rejeté ; `fr_status`/`en_status` hors énumération rejeté.

## Open questions

1. **Travail — layout frontend vs CMS** (ci-dessus) : recommandation donnée (Option 1 affinée), à valider avant implémentation — affecte directement si `work_items` gagne ou non une colonne `layout`.
2. **Cloudflare Images vs Image Resizing** (ADR-005) : reste ouvert, hors du périmètre pur schéma D1 — a un impact budgétaire/opérationnel qui n'est pas tranché ici.
3. **Vidéo** : Divine Motion offre de la vidéographie, mais `media.media_type` est restreint à `'image'` au MVP — aucun pipeline de stockage/livraison vidéo n'a été choisi (Cloudflare Stream n'est pas dans la stack confirmée par ADR-001). Signalé explicitement plutôt que décidé silencieusement.
4. **Rétention de `content_snapshots`** : recommandé 5 instantanés par entité — nombre à confirmer, pas une contrainte technique dure.
5. **Rétention de `contact_submission_log`** : recommandé 30-90 jours — à confirmer avec l'analyse PFIA/Loi 25 déjà planifiée (voir `docs/SECURITY_PRIVACY.md`).

## Risks

- Le modèle brouillon/publié hybride (statut simple vs ligne brouillon séparée) est plus complexe à expliquer qu'une règle unique — documenté explicitement ici pour éviter toute dérive future vers une troisième variante non justifiée.
- Les triggers de droits de publication dépendent de `PRAGMA foreign_keys`/triggers réellement actifs sur chaque connexion D1 — à vérifier explicitement en test (voir Schema tests), pas supposé.
- Le calcul algorithmique de composition Travail (Option 1) est un pari UX : à valider visuellement avec un vrai volume de photos réelles avant de le considérer acquis.

## ADR to create/update

- **Créées** : `ADR-011-publication-rights-model.md`, `ADR-012-d1-id-timestamp-conventions.md`.
- **Mises à jour** : `ADR-003` (point ouvert résolu), `docs/CMS_SPEC.md`, `docs/MEDIA_ARCHITECTURE.md`, `docs/MASTER_BRIEF.md` (notes de supersession), `docs/ROADMAP.md` (état Phase 4).
- **Non créées volontairement** (décisions structurantes proposées, pas verrouillées — section 37 du brief) : draft/publish hybride, statut FR/EN par ligne, architecture du contenu de page, propriété du layout Travail/Services, non-stockage des soumissions Contact. Toutes documentées ci-dessus comme recommandations, à valider avant qu'une ADR ne les verrouille.

## Documentation modified

`docs/CMS_SPEC.md`, `docs/MEDIA_ARCHITECTURE.md`, `docs/MASTER_BRIEF.md`, `docs/ROADMAP.md`, `docs/decisions/ADR-003-curated-work-vs-project-model.md`, plus ce document et les deux nouvelles ADR.

## Recommendation

Le modèle est complet, cohérent avec les 12 ADR existantes, ferme la question ouverte des droits de publication, et reste délibérément simple là où le contenu est simple (Travail, Services, Témoignages) tout en protégeant réellement les sessions d'édition longues (contenu de page). Aucune implémentation D1 n'a été faite — tout est proposition, prêt à audit.

**DATA MODEL READY FOR IMPLEMENTATION: NO** — en attente de la revue Boris/ChatGPT explicitement demandée par le brief avant toute première migration réelle. Le schéma lui-même est jugé prêt sur le fond ; le "NO" reflète le process requis (validation avant verrouillage), pas un doute technique non résolu.
