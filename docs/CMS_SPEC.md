# CMS Spec — Divine Motion V2

## Arborescence admin

Dashboard, Modifier le site, Travail, Médias, Services, Témoignages, Contenu (Accueil / À propos / Contact), SEO, Paramètres.
Le module « Projets » n'est plus un nœud principal (voir `docs/decisions/ADR-003-curated-work-vs-project-model.md`).

## Travail

Fonctions CMS :
- ajouter un média depuis la médiathèque ;
- retirer un média de Travail ;
- réordonner les images (drag-and-drop, réordonnancement d'une sélection existante — pas un page builder) ;
- modifier la catégorie ;
- modifier les légendes FR/EN ;
- modifier les alt texts FR/EN ;
- modifier le point focal ;
- afficher/masquer.

### Modèle conceptuel `work_items` (fourni le 15 septembre 2026, à finaliser en Phase 4)

```text
work_items
  id
  media_id
  category
  position

  caption_fr
  caption_en

  alt_fr
  alt_en

  focal_x
  focal_y

  is_visible

  created_at
  updated_at
```

**Résolu en Phase 4 (Brief 009) — voir `docs/decisions/ADR-011-publication-rights-model.md`.** Le garde-fou de publication ne porte pas un champ séparé sur `work_items`/`testimonials`, mais référence `media.publication_rights_confirmed` (une seule confirmation par fichier, quel que soit son usage) et le fait respecter à la publication (FR/EN indépendamment) via un trigger D1. Voir `docs/DATA_ARCHITECTURE.md` et `docs/drafts/001_initial.sql`.

## Médiathèque

Upload, upload multiple, recherche, tri, aperçu, alt FR/EN, point focal, dimensions, poids, utilisation, soft delete, restauration. Protection anti-suppression pour tout média référencé.

## Services / Témoignages / Contenu (Accueil, À propos, Contact)

Modèles inchangés dans leur principe par rapport au Master Brief original (sections 42-43), tous en contenu structuré et typé — jamais de blob JSON générique (`docs/decisions/ADR-004-structured-typed-content.md`).

## Publication

Sauvegarder en brouillon → Prévisualiser (desktop/tablette/mobile) → Publier. Publication indépendante par langue.

## Couche de données (Implementation Brief 011)

`src/lib/db/` implémente désormais le brouillon/publié, les instantanés et les droits de publication décrits ci-dessus pour `work_items`, `services` (+ `service_features`), `testimonials`, et le contenu des 5 pages (Accueil/Travail/Services/À propos/Contact, y compris les enfants d'À propos et de Services). Voir `docs/DATA_ARCHITECTURE.md` "Data Access Layer" pour l'architecture. Aucune route admin ni CMS ne l'utilise encore — cette couche est la fondation sur laquelle le futur CMS (Dashboard, Travail, Médias, Services, Témoignages, Contenu, SEO, Paramètres) s'appuiera, pas le CMS lui-même.

## Socle admin + coque CMS (Implementation Brief 012)

L'arborescence admin ci-dessus existe désormais comme surface réelle, protégée par Cloudflare Access (JWT vérifié cryptographiquement côté serveur — voir `docs/ADMIN_SECURITY.md`) : `/admin` (Dashboard, lecture D1 réelle via `getAdminDashboardSummary`), puis `/admin/site`, `/admin/work`, `/admin/media`, `/admin/services`, `/admin/testimonials`, `/admin/content`, `/admin/seo`, `/admin/settings` — ces huit derniers sont des placeholders « Module en préparation », sans CRUD, sans upload, sans Visual Editor. Un futur Brief CMS construira chaque module (en commençant vraisemblablement par Travail, cohérent avec le reste de cette spec) sur cette même fondation DAL + auth.

## CMS Travail — premier module réel (Implementation Brief 013)

`/admin/work` n'est plus un placeholder : c'est le premier module CMS complet, prouvant le cycle `D1 → admin → draft → preview → publish` avant tout autre module. Aucun upload R2 (hors scope, voir Brief 014+) — la sélection média se fait exclusivement parmi les médias déjà `ready` via `listMedia()` (`src/components/admin/MediaPickerField.astro`), sans miniature réelle (pas de pipeline R2/Cloudflare Images — placeholder visuel neutre déjà établi, `public/mock/placeholder.svg`).

**Routes** (`src/pages/admin/work/`) :
```text
GET  /admin/work                       liste (publiés + brouillons)
GET  /admin/work/new                   formulaire de création
GET  /admin/work/:id                   édition (:id = ligne publiée OU brouillon)
GET  /admin/work/:id/preview           aperçu admin-only du brouillon (ou publié si aucun brouillon)
POST /admin/work/create
POST /admin/work/:id/save              :id = brouillon (créé automatiquement si absent — §13)
POST /admin/work/:id/publish           :id = brouillon
POST /admin/work/:id/delete-draft      :id = brouillon
POST /admin/work/:id/language-status   :id = ligne PUBLIÉE (fr_status/en_status)
POST /admin/work/reorder               brouillons uniquement — voir DATA_ARCHITECTURE.md
```

**Édition = toujours un brouillon.** Ouvrir un item publié réutilise son brouillon déjà ouvert ou en crée un (`createWorkItemDraft`/`getWorkItemDraft`, nouveau dans `src/lib/db/work.ts`) — jamais d'écriture directe sur la ligne publiée. « Enregistrer » n'affecte jamais le site public ; seul « Publier » (bouton séparé, DAL `publishWorkItem`) le fait, avec instantané automatique. Publier le contenu et publier une langue (FR/EN, `language-status`) restent deux actions distinctes, exactement comme la DAL les a conçues (Brief 011).

**Réordonnancement** : draft-safe uniquement (`reorderWorkItemDrafts`, Review 011A) — voir `docs/DATA_ARCHITECTURE.md` "Réordonnancement" pour la limitation de publication groupée, non résolue dans ce brief par choix explicite (Brief 013 §20-21).

**Sécurité des mutations** : voir `docs/ADMIN_SECURITY.md` "Mutation security" et `docs/decisions/ADR-016-admin-mutation-security.md`.

## Médiathèque — deuxième module réel (Implementation Brief 014)

`/admin/media` n'est plus un placeholder : upload direct navigateur → R2 (jamais proxyfié par le Worker), vérification réelle post-upload, médiathèque avec filtres, fiche média (alt FR/EN, point focal, droits de publication, utilisation, corbeille/restauration). Architecture complète : `docs/MEDIA_ARCHITECTURE.md` "Implémentation" et `docs/decisions/ADR-017-r2-direct-upload-lifecycle.md`.

**Routes** (`src/pages/admin/media/`) :
```text
GET  /admin/media                          médiathèque (grille, filtres actif/corbeille/statut/recherche)
GET  /admin/media/:id                      fiche média (métadonnées, alt FR/EN, point focal, droits, usage)
GET  /admin/media/:id/file                 aperçu admin-only (lit l'objet R2 réel)
POST /admin/media/upload/authorize         JSON — crée la ligne 'pending' + URL présignée
POST /admin/media/:id/upload-complete      JSON — vérifie l'objet R2 réel, transition uploaded/ready/failed
POST /admin/media/:id/save                 alt FR/EN, point focal, droits de publication
POST /admin/media/:id/delete               corbeille (bloqué si utilisé — MEDIA_IN_USE, réutilise le garde-fou existant)
POST /admin/media/:id/restore
```

**Pas de second sélecteur média.** Le sélecteur de la CMS Travail (`MediaPickerField.astro`) relit `listMedia().filter(processing_status === 'ready')` à chaque chargement de page — un média fraîchement uploadé et passé `ready` y apparaît immédiatement, sans aucune modification de ce module.

**Upload multi-fichiers** (`src/lib/admin/media-upload-client.ts`, seul module de ce brief qui tourne dans le navigateur) : chaque fichier suit son propre cycle indépendant `authorize → PUT direct R2 → upload-complete` ; l'échec d'un fichier n'affecte jamais les autres. Statuts affichés par fichier (En attente / Upload… / Vérification… / Prêt / Échec), pourcentage réel pendant l'upload (XMLHttpRequest, pas une barre globale opaque). Réessai manuel uniquement (pas de retry automatique) — relance un cycle complet, sans toucher à la ligne D1 échouée précédente.

**Sécurité des mutations** : même `requireAdminMutation` que la CMS Travail. Chaque route `:id` vérifie l'existence réelle de la ligne avant d'agir (IDOR).

## Services CMS — troisième module réel

`/admin/services` n'est plus un placeholder : deuxième module CMS complet après Travail, même discipline (`D1 → admin → draft → publish`), mêmes mécaniques réutilisées telles quelles (`MediaPickerField.astro`, `requireAdminMutation`, `flash.ts`, moteur `publish.ts`, `adminErrorMessage`). Services = offres réservables/commerciales (Mariage, Portrait/Lifestyle, Événements, et toute offre future) ; Travail reste l'exposition éditoriale du portfolio — les deux concepts ne sont jamais mélangés.

**Routes** (`src/pages/admin/services/`) :
```text
GET  /admin/services                       liste (publiés + brouillons)
GET  /admin/services/new                    formulaire de création
GET  /admin/services/:id                    édition (:id = ligne publiée OU brouillon)
POST /admin/services/create
POST /admin/services/:id/save               :id = brouillon (créé automatiquement si absent)
POST /admin/services/:id/publish            :id = brouillon
POST /admin/services/:id/delete-draft       :id = brouillon
POST /admin/services/:id/language-status    :id = ligne PUBLIÉE (fr_status/en_status)
POST /admin/services/reorder                brouillons uniquement — même limitation documentée que Travail (pas de publication groupée atomique)
```

**Champ « courte accroche ».** Ni le schéma d'origine (Brief 009) ni le mock pré-CMS n'avaient de champ distinct du titre et de la description pour une accroche courte — ajouté en migration additive (`tagline_fr`/`tagline_en`, nullable, `migrations/0004_services_cms.sql`), jamais rétroactif sur 0001-0003.

**Droits de publication étendus à Services.** Contrairement à Travail/Témoignages, `services` n'avait aucun garde-fou de droits (aucun trigger `trg_services_*` n'existait avant ce brief) — un vrai manque, pas une exclusion voulue, vu qu'aucun module CMS réel n'existait encore pour Services au moment d'ADR-011. `migrations/0004_services_cms.sql` ajoute les 3 mêmes triggers que Travail ; `src/lib/db/services.ts` applique le même préflight applicatif. Voir `docs/decisions/ADR-011-publication-rights-model.md` pour le détail complet.

**Générique, pas plafonné à 3.** Le schéma n'a jamais imposé de limite de lignes ; `/admin/services/new` permet d'en créer autant que nécessaire. La présentation visuelle (`wide-offset`/`split`/`text-image`) reste hors D1 (ADR-014) : `src/lib/service-layout.ts` garde les 3 associations `slug → layout` établies et fait tourner cycliquement les mêmes 3 variantes pour toute offre créée au-delà, jamais une donnée éditable depuis l'admin.

**Frontend public réellement connecté.** `services.astro`/`en/services.astro` passent de `prerender = true` à `prerender = false` (même correctif que Travail, Validation Brief 014S) : `ServicesView.astro` lit désormais `listPublishedServices()` en temps réel. Seule la copie de page (titre/intro/« Approche »/CTA final) reste sur le mock — décision volontairement scopée, identique à celle prise pour `content.title/intro/ctaHeadline` de Travail (`services_page_content` existe déjà en D1 mais son édition nécessiterait sa propre UI admin, hors périmètre de ce brief).

**Image publique.** Réutilise intégralement l'architecture créée en Validation Brief 014S : `/media/:id/file` + `resolvePublicMediaObject`, désormais étendu pour reconnaître aussi bien un usage Travail qu'un usage Services (`isMediaUsedByPublicService`, `src/lib/db/services.ts`) — aucun second système média, aucun bucket R2 rendu public.

**UX — pas de jargon anglais dans l'interface.** Les statuts s'affichent « Publié »/« Brouillon » (jamais `published`/`draft` bruts) et « Visible »/« Masqué » pour `is_active`, contrairement à l'écran Travail existant qui affiche encore les valeurs brutes anglaises (non touché — CMS Travail validé, hors périmètre de ce brief).
