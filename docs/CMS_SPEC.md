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
