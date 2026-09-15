# Information Architecture — Divine Motion V2

## Navigation principale

Accueil, Travail, Services, À propos, Contact.

## Routes publiques

**FR** (racine, sans préfixe) — `/`, `/travail`, `/services`, `/a-propos`, `/contact`, `/confidentialite`
**EN** (préfixe `/en`) — `/en`, `/en/work`, `/en/services`, `/en/about`, `/en/contact`, `/en/privacy`

Pas de route projet individuelle (`/travail/[slug]` retiré du MVP — voir `docs/decisions/ADR-003-curated-work-vs-project-model.md`). Une future fonctionnalité « Stories / Histoires » pourrait réintroduire des pages narratives pour des mariages/événements exceptionnels, mais elle est hors scope aujourd'hui et n'a pas de route réservée.

## Arborescence admin (CMS)

```text
Dashboard
Modifier le site
Travail
Médias
Services
Témoignages
Contenu
  Accueil
  À propos
  Contact
SEO
Paramètres
```

Le module « Projets » n'existe plus comme nœud principal de l'IA admin.

## Sitemap

Sitemap multilingue (FR + EN), généré à partir des routes ci-dessus. Pas d'entrée par élément de Travail individuel puisqu'il n'y a pas de page dédiée par média/sélection.
