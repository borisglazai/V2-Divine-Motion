# ADR-002 — Visual Content Editor vs Page Builder

**Décision.** L'éditeur visuel de Divine Motion V2 est un Visual Content Editor : édition de contenu (texte, image, lien, sélection, visibilité de section) à l'intérieur d'emplacements prédéfinis. Ce n'est jamais un Page Builder (pas de position libre, pas de CSS, pas de colonnes libres). Édition inline pour le simple, panneau latéral pour le complexe.

**Contexte.** L'ancien projet utilisait déjà des composants de rendu partagés entre admin et public (`editable=true`), et a pourtant dérivé vers un éditeur « trop ambitieux » au fil du temps (deux générations successives constatées dans ses scripts de test).

**Pourquoi.** L'analyse (voir `docs/ONBOARDING_REVIEW.md` section 4) montre que la cause de la dérive n'était pas l'absence de composants partagés, mais l'absence de typage strict du contenu éditable (`cms_settings`, blob JSON libre). Le garde-fou doit donc être structurel (voir ADR-004), pas seulement une intention d'UI.

**Alternatives.** Page builder complet (écarté, contredit directement le principe produit « pas de page builder »). Pas d'éditeur visuel du tout, édition uniquement via base de données/fichiers (écarté, contredit le critère clé : une personne non technique doit pouvoir publier seule).

**Conséquences.** Chaque nouvelle zone éditable doit être conçue avec un schéma explicite avant d'être exposée à l'éditeur. L'admin et le site public partagent les mêmes composants (WYSIWYG réel).
