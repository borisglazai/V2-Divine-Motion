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
