# ADR-004 — Contenu structuré et typé, jamais un blob JSON générique

**Décision.** Aucun contenu de page n'est stocké comme blob JSON générique. Tout contenu éditable est structuré, typé et validé (schéma explicite par section/composant).

**Contexte.** L'ancien projet stockait le contenu de page dans `cms_settings`, une paire clé/valeur JSON libre (jusqu'à 180 000 caractères), ce qui a permis une dérive progressive vers un éditeur trop flexible malgré des composants de rendu partagés (voir ADR-002).

**Pourquoi.** C'est le seul garde-fou fiable contre la dérive « page builder » dans la durée. Il rend aussi triviale la protection anti-suppression des médias utilisés : un `media_id` référencé est toujours une colonne/relation explicite, jamais du texte libre à parser (voir `docs/MEDIA_ARCHITECTURE.md`).

**Alternatives.** Blob JSON avec validation applicative a posteriori (écarté — plus fragile, dérive constatée dans l'ancien projet). CMS headless générique à champs libres (écarté, cf. ADR-001).

**Conséquences.** Plus de rigueur de schéma dès la Phase 4. Chaque nouvelle zone éditable (Travail, Services, Contenu de page) nécessite une définition de schéma explicite avant d'être exposée à l'éditeur visuel.
