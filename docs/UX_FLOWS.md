# UX Flows — Divine Motion V2

## Parcours visiteur

VOIR → RESSENTIR → COMPRENDRE → ÊTRE RASSURÉ → CONTACTER, décliné par page.

### Accueil

Header → Hero (grande image + headline court) → Aperçu Travail (quelques images fortes) → Brand Statement (une phrase) → Services (aperçu très court) → Image de respiration → À propos (aperçu minimal) → CTA Contact → Footer. L'accueil reste court, pas d'accumulation de sections marketing.

### Travail

La page la plus minimaliste du site — exposition / portfolio éditorial. Titre « Travail » (+ phrase courte optionnelle) → galerie éditoriale curatée, composée selon les gabarits du design system → CTA Contact. Filtres (Tout / Mariages / Portraits & Lifestyle / Événements) prévus dans le modèle (`work_items.category`) mais pas obligatoires à l'affichage au lancement. Pas de pages projet individuelles, pas de fiche détaillée par élément au MVP.

### Services

Fonction commerciale, distincte de Travail (qui est la preuve visuelle). Trois univers, chacun : grande image, titre, 2-4 lignes utiles, CTA Contact. Pas de cartes SaaS, pas de catalogue détaillé.

### À propos

Grande image, grand titre, quelques paragraphes, éventuelle seconde image, CTA Contact. Pas de sections Mission/Vision/Valeurs/Pourquoi nous choisir.

### Contact

Un seul formulaire intelligent : nom, courriel, téléphone (facultatif), type de prestation (Mariage / Portrait-Lifestyle / Événement / Autre), date (facultative), lieu, message. Turnstile + mention de confidentialité (lien vers `/confidentialite` ou `/en/privacy`) + notification email fiable.

## Parcours admin

1. `admin.divinemotion.ca` → Cloudflare Access (JWT vérifié côté Worker).
2. Dashboard → raccourci « Modifier le site ».
3. « Modifier le site » ouvre un rendu proche du site public réel, avec zones cliquables.
4. Petite modification (texte, lien, image ponctuelle) → édition inline.
5. Modification plus complexe (sélection Travail, réordonnancement, ajout de média) → panneau latéral / section CMS structurée dédiée (Travail).
6. Sauvegarder en brouillon → Prévisualiser (desktop / tablette / mobile) → Publier.
7. La publication est indépendante par langue : un contenu EN incomplet n'est jamais publié en EN, pendant que le FR correspondant peut continuer d'être publié.

## Flux Travail dans le CMS

Médiathèque → sélectionner un média → l'ajouter à Travail (crée un `work_item`) → définir catégorie, légendes FR/EN, alt FR/EN, point focal → réordonner par glisser-déposer parmi les éléments de Travail → afficher/masquer → publier. Le glisser-déposer réordonne une sélection existante ; il ne positionne jamais un élément librement sur la page (pas de coordonnées, pas de CSS) — ce n'est donc pas un page builder.

## Flux média

Upload (direct vers R2 via URL présignée) → métadonnées (alt FR/EN, point focal) en D1 → disponible dans la médiathèque → utilisable dans Travail / Services / Témoignages / Contenu → suppression = corbeille (soft delete) → période de rétention → purge automatique (tâche planifiée). Un média référencé quelque part est protégé contre la suppression.
