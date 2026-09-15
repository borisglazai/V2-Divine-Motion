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
