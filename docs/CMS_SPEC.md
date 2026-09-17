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

## Témoignages CMS — troisième module réel

`/admin/testimonials` n'est plus un placeholder. Même patron que Services : `testimonials-actions.ts`, `testimonials-validation.ts`, `TestimonialForm.astro`, routes `/admin/testimonials/*`. Contrairement à Travail/Services, le schéma `testimonials` (Brief 009/011) couvrait déjà 100 % des champs demandés et portait déjà les 3 triggers de droits de publication (`trg_testimonials_rights_gate_fr/en/media_change`, depuis 0001/0002) — **aucune migration** pour ce brief.

**Routes** (`src/pages/admin/testimonials/`) : même forme que Services (`new`, `:id`, `create`, `:id/save`, `:id/publish`, `:id/delete-draft`, `:id/language-status`, `reorder`).

**Photo optionnelle.** `testimonials.photo_media_id` est nullable — premier module où le média principal n'est pas obligatoire. `MediaPickerField.astro` gagne un prop `required?: boolean` (défaut `true`, Travail/Services inchangés) qui ajoute une option « Aucun média » au radiogroup quand `false`.

**Complète le garde-fou de droits.** `publishTestimonial()` n'avait pas le préflight applicatif pour le cas « remplacer le média d'une ligne déjà publiée par un média sans droits confirmés » (le trigger D1 le couvrait déjà, sans message clair avant l'abort SQL) — ajouté par cohérence avec `publishWorkItem`/`publishService` (voir ADR-011).

**Frontend public — nouvelle surface, pas une reconnexion de mock.** Contrairement à Travail/Services, aucune page ni mock public n'existait pour les témoignages avant ce brief (`docs/INFORMATION_ARCHITECTURE.md` ne les listait que dans l'arborescence admin ; `docs/UX_FLOWS.md` du 15 septembre avait retiré la section Témoignages de l'Accueil). Décision explicite (Témoignages CMS brief) : réintroduire une section Témoignages sur l'Accueil, entre Services et l'image de respiration — voir `docs/UX_FLOWS.md`. `index.astro`/`en/index.astro` passent en `prerender = false` (même correctif que Travail/Services) ; `HomeView.astro` lit `listPublishedTestimonials()` en temps réel et n'affiche la section que si au moins un témoignage est publié+visible dans la langue courante. Rendu sobre : citation + nom (+ rôle/contexte facultatif) + avatar circulaire optionnel — jamais une carte SaaS (étoiles, bulle de citation, carrousel).

**Image publique.** Réutilise `/media/:id/file` + `resolvePublicMediaObject`, désormais étendu pour reconnaître aussi l'usage Témoignages (`isMediaUsedByPublicTestimonial`, `src/lib/db/testimonials.ts`) en plus de Travail/Services.

## Éditeur visuel Phase 1 — « Modifier le site » (`/admin/site/**`)

Voir `docs/VISUAL_EDITOR_SPEC.md` (section « Phase 1 ») et `docs/decisions/ADR-018-visual-editor-architecture.md` pour la décision d'architecture complète. Contrairement aux modules précédents, ce n'est jamais un formulaire admin classique : `/admin/site` (Accueil) et `/admin/site/services` (texte de page Services) rendent les MÊMES composants Astro que le site public (`HomeView.astro`/`ServicesView.astro`), avec une prop `mode: "public" | "edit" | "preview"` — jamais une seconde copie du rendu.

**Chrome persistant.** `EditorToolbar.astro` (mode label, navigation entre les 5 pages, bascule FR/EN, Enregistrer/Aperçu/Publier, statut de publication par langue, Quitter) est injecté via le slot nommé `admin-chrome` que `BaseLayout.astro` expose juste avant `</body>` — vide par défaut, donc zéro impact sur le rendu public. Les 3 pages non câblées cette phase (`/admin/site/travail`, `/admin/site/a-propos`, `/admin/site/contact`) utilisent la même toolbar avec `available={false}` : la navigation entre pages en restant en mode édition est réelle dès maintenant partout, même là où le contenu n'est pas encore éditable.

**Champs éditables Phase 1.**
- Accueil (`home_content`) : titre hero, sous-titre hero, image hero (+ point focal du média), phrase de marque, titre du CTA final.
- Services (`services_page_content`) : titre de page, intro, libellé « Approche », titre du CTA final. Les services individuels restent gérés exclusivement par `/admin/services` (aucune interférence).
- Hors périmètre cette phase (inchangé) : aperçus Travail/Services/À propos sur l'Accueil, les 3 étapes d'approche, Travail (composition de galerie, ADR-014), À propos et Contact (audit seulement).

**Édition inline + remplacement d'image.** `Editable.astro` (texte, `contenteditable`) et `EditableImage.astro` (image, ouvre le sélecteur de médiathèque partagé rendu une seule fois par `EditorToolbar.astro`) ne rendent RIEN de plus que le composant public sous-jacent quand `editable=false` — la garantie structurelle qu'aucun contrôle d'édition ne peut fuiter côté public.

**Brouillon/publication.** Aucun nouveau mécanisme : réutilise le moteur générique ADR-013 (`src/lib/db/pages.ts`'s `pageRepo`) déjà en place depuis le Brief 011. `home_content` gagne ses triggers de garde des droits média dans `migrations/0005_home_content_rights_gate.sql`, sur le même modèle que `services`/`testimonials`/`work_items` (ADR-011) — nécessaire parce que c'est la première fois que `home_content` a un vrai chemin de publication publique (son image hero est éditable).

**Routes.** `src/pages/admin/site.astro` (Accueil), `src/pages/admin/site/services.astro`, `src/pages/admin/site/{travail,a-propos,contact}.astro` (placeholders), plus les endpoints de mutation `src/pages/admin/site/{home,services}/{save,publish,language-status}.ts` — même patron `requireAdminMutation` + action typée que Travail/Services/Témoignages.
