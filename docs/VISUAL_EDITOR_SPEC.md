# Visual Editor Spec — Divine Motion V2

Principe : **Visual Content Editor = OUI, Page Builder = NON** (réaffirmé section 17 de la mise à jour du 15 septembre 2026).

## Ce que l'admin peut faire

- Modifier un texte (édition inline).
- Remplacer une image (depuis la médiathèque).
- Changer un lien.
- Modifier une sélection (ex. quels médias apparaissent dans Travail, dans quel ordre).
- Masquer/afficher certaines sections.

## Ce que l'admin ne peut pas faire

Changer les polices, modifier le CSS, déplacer librement au pixel, créer des colonnes, modifier les breakpoints, reconstruire la mise en page.

## Règle d'interaction

Petite modification → édition inline directement sur le rendu.
Modification plus complexe → panneau latéral.

## Cas Travail

Cliquer sur une image de Travail dans l'éditeur propose : Remplacer, Retirer de Travail, Point focal, Alt FR, Alt EN, Légende.
Le réordonnancement principal des éléments de Travail reste dans la section CMS structurée dédiée (drag-and-drop autorisé pour réordonner une liste existante — ce n'est jamais un positionnement libre en pixels, donc ce n'est pas un page builder).

## Bilinguisme dans l'éditeur

L'éditeur indique toujours clairement la langue en cours d'édition. Une page ne mélange jamais les langues. Si un contenu EN essentiel est incomplet, la version anglaise de ce contenu n'est pas publiée (le FR peut continuer d'être publié indépendamment).

## Garde-fou structurel

Le contenu édité est toujours structuré et typé (voir `docs/decisions/ADR-004-structured-typed-content.md`) — jamais un blob JSON générique. C'est la protection contre la dérive « page builder » observée dans l'ancien projet (voir `docs/ONBOARDING_REVIEW.md` section 4).

## Phase 1 — implémentation (`/admin/site/**`)

Voir `docs/decisions/ADR-018-visual-editor-architecture.md` pour la décision d'architecture complète (Option B retenue par Boris). Résumé :

- Entrée : `/admin/site` (Accueil) et `/admin/site/services` (texte de page Services) sont de vrais éditeurs fonctionnels. `/admin/site/travail`, `/admin/site/a-propos`, `/admin/site/contact` sont des pages « bientôt disponible » qui partagent la même barre d'outils persistante (`EditorToolbar.astro`) — la navigation entre les 5 pages en restant en mode édition est donc réelle dès cette phase, même là où le contenu n'est pas encore éditable.
- Zéro duplication de rendu : `HomeView.astro`/`ServicesView.astro` sont les MÊMES composants que le site public, pilotés par une prop `mode?: "public" | "edit" | "preview"`. `Editable.astro`/`EditableImage.astro` rendent zéro balisage supplémentaire quand `editable=false` (le cas public, toujours).
- Chrome persistant : injecté via un slot nommé `admin-chrome` sur `BaseLayout.astro` (jamais mélangé au contenu public réel).
- Champs éditables en Phase 1 : Accueil (titre hero, sous-titre hero, image hero + point focal, phrase de marque, titre du CTA final) ; Services (titre de page, intro, libellé « Approche », titre du CTA final). Tout le reste (aperçus Travail/Services/À propos sur l'Accueil, les 3 étapes d'approche, les services individuels) reste hors périmètre de cette itération.
- Brouillon/publication : réutilise intégralement ADR-013 (ligne fantôme `draft_of_id`) et ADR-011 (droits média) — `home_content` reçoit ses triggers de garde dans `migrations/0005_home_content_rights_gate.sql`, sur le même modèle que `services`/`testimonials`/`work_items`.
