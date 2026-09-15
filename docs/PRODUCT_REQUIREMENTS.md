# Product Requirements — Divine Motion V2

**Statut :** reflète la mise à jour officielle du 15 septembre 2026 (Phases 0, 1, 2 finalisées). Remplace toute lecture antérieure fondée sur un modèle « Projects » comme cœur du MVP — voir `docs/decisions/ADR-003-curated-work-vs-project-model.md`.

## Positionnement

Sobre, premium, sombre, éditorial, cinématographique, très photographique, rapide, simple à maintenir, très peu textuel, centré sur la qualité du regard et des images. Objectif immédiat pour le visiteur : « C'est un vrai professionnel. »

## Pages MVP

Accueil, Travail, Services, À propos, Contact — plus une page utilitaire Confidentialité (`/confidentialite`, `/en/privacy`). Aucune page projet individuelle au MVP.

## Parcours principal

VOIR → RESSENTIR → COMPRENDRE → ÊTRE RASSURÉ → CONTACTER

## Changement structurant : Travail = vitrine curatée, pas un catalogue de projets

La page Travail ne montre plus une accumulation de projets (mariage X, shooting Y, événement Z). Elle devient une vitrine éditoriale curatée à partir d'une sélection de médias : Médiathèque → Sélection de médias → Page Travail. Objectif : montrer le style et le regard de Divine Motion, pas construire une archive publique. Voir ADR-003 pour le contexte complet et les conséquences.

## Fonctionnalités MVP

- Site public bilingue FR/EN (5 pages + Confidentialité), une page ne mélange jamais les langues.
- Médiathèque : upload (simple et multiple), recherche, tri, aperçu, alt FR/EN, point focal, dimensions, poids, utilisation, soft delete + restauration, protection anti-suppression pour tout média utilisé.
- Travail : sélection curatée de médias (`work_items`) — catégorie, position, légendes/alt FR-EN, point focal, visibilité — gérée dans une section CMS structurée avec réordonnancement par glisser-déposer (drag-and-drop d'une sélection existante, jamais un positionnement libre).
- Services : trois univers (Mariages, Portraits & Lifestyle, Événements), chacun avec image, titre, 2-4 lignes utiles, CTA Contact.
- À propos : contenu court, pas de sections artificielles (Mission/Vision/Valeurs/Pourquoi nous choisir).
- Contact : formulaire court (nom, courriel, téléphone facultatif, type de prestation, date facultative, lieu, message), Turnstile, mention de confidentialité, notification email fiable, pas de CRM custom.
- Visual Editor : Visual Content Editor (jamais un Page Builder) — édition inline pour le simple, panneau latéral pour le complexe.
- CMS structuré : Dashboard, Modifier le site, Travail, Médias, Services, Témoignages, Contenu (Accueil/À propos/Contact), SEO, Paramètres.
- SEO bilingue : hreflang, canonical, sitemap multilingue.
- Sécurité : Cloudflare Access + vérification JWT réelle côté Worker, Turnstile.
- Accessibilité WCAG 2.2 AA.
- Analytics : Cloudflare Web Analytics uniquement, pas d'analytics custom.

## Hors MVP

Pages projet individuelles, page builder, drag-and-drop libre (au sens mise en page), éditeur CSS, CRM complet, espace client, paiement, facturation, contrats, réservation en ligne, galeries clients, favoris, application mobile, blog avancé, DAM complexe, retouche photo, IA générative obligatoire, analytics custom, permissions utilisateurs complexes.

**Distinct du reste de la liste hors MVP** : une future fonctionnalité « Stories / Histoires » (pages narratives pour certains mariages/événements exceptionnels) est explicitement envisagée comme évolution possible après lancement, sans contrainte imposée par le modèle `work_items` actuel — elle n'a simplement pas de spécification aujourd'hui.

## Critères de succès

Visiteur : comprend en quelques secondes que Divine Motion est un professionnel, voit son style, sait comment le contacter.
Admin : peut maintenir le site (textes, images, sélection Travail, services, publications, SEO simple) sans développeur.
Technique : un développeur senior externe peut cloner, installer, comprendre, migrer, tester, déployer sans lire l'historique des conversations.
Long terme : l'architecture reste assez simple et disciplinée pour évoluer sans reconstruction complète.
