# ADR-018 — Architecture de l'éditeur visuel Phase 1 (« Modifier le site »)

**Décision.** L'éditeur visuel vit entièrement sous `/admin/site/**`, dans l'arborescence déjà protégée par Cloudflare Access (`src/middleware.ts`). Il n'introduit aucun nouveau mécanisme de session/cookie pour authentifier une session d'édition sur une URL publique. Le rendu WYSIWYG fidèle exigé par Boris est obtenu en réutilisant, sans duplication, les mêmes composants Astro que le site public (`HomeView.astro`, `ServicesView.astro`), pilotés par une prop `mode?: "public" | "edit" | "preview"` — jamais une deuxième copie de la logique de rendu.

**Contexte.** Le brief demandait explicitement un choix entre deux architectures :

- **Option A** — éditer directement sur les URLs publiques (`/`, `/services`, …), avec un bandeau d'édition affiché uniquement à l'admin authentifié.
- **Option B** — une URL admin dédiée (`/admin/site/**`) qui rend les mêmes composants que le public, dans le même style, avec une toolbar persistante.

Option A a été explicitement écartée après audit : Cloudflare Access n'injecte le JWT `Cf-Access-Jwt-Assertion` que sur les chemins couverts par une application Access (aujourd'hui uniquement `/admin/**` — confirmé par `wrangler.toml`, qui ne déclare aucun binding par hostname/route séparé). Rendre `/` éditable pour un admin authentifié aurait donc exigé un tout nouveau mécanisme de session signée, distinct du modèle JWT-par-requête sur lequel repose toute la sécurité admin actuelle (ADR-008) — un changement d'architecture de sécurité largement hors du périmètre de cette phase.

Boris a tranché pour l'Option B, avec une exigence explicite et contraignante : « je veux toutefois que l'expérience reste exactement conforme à la vision : réutiliser les mêmes composants que le frontend public, avec un rendu WYSIWYG fidèle, une toolbar d'édition persistante, navigation entre pages, édition inline et remplacement d'images directement dans leur emplacement [...] en évitant toute duplication de composants ou de logique de rendu. »

**Comment la contrainte « zéro duplication » est tenue concrètement.**

1. **`HomeView.astro`/`ServicesView.astro` sont EXACTEMENT les composants que rendent `/` et `/services`.** Une prop `mode` (par défaut `"public"`) fait basculer la source de données (D1 publié uniquement vs brouillon-ou-publié) et active ou non les affordances d'édition — le public et l'admin ne divergent jamais sur la structure du rendu, seulement sur ces deux paramètres.
2. **`Editable.astro`/`EditableImage.astro`** sont les seuls points de variation dans le balisage. En mode public (`editable=false`, toujours le cas hors `/admin/site/**`), ils ne rendent STRICTEMENT RIEN de plus que leur `<slot>`/`<ImageFrame>` — aucune classe, aucun attribut `data-cms-*`, aucun bouton. Le risque qu'un contrôle d'édition fuite côté public est donc structurellement nul, pas seulement discipliné par convention.
3. **La toolbar persistante (`EditorToolbar.astro`) n'est jamais un ancêtre du contenu qu'elle édite.** Elle est injectée via un slot nommé `admin-chrome` que `BaseLayout.astro` expose juste avant `</body>` (vide par défaut — zéro différence pour le public) et que `HomeView.astro`/`ServicesView.astro` transmettent tel quel. Le bouton « Enregistrer » cible le formulaire réel (`<form id="cms-editor-form">`, activé uniquement quand `BaseLayout` reçoit `editorFormAction`) via l'attribut HTML `form`, sans avoir besoin d'englober ce formulaire dans son propre balisage.
4. **Un seul script client, écrit une fois**, synchronise l'état des champs `contenteditable`/de l'image sélectionnée vers des champs cachés du formulaire juste avant la soumission — jamais de logique dupliquée par champ éditable.

**Brouillon/publication.** Aucun nouveau mécanisme : les tables singleton `home_content`/`services_page_content` (Brief 011, `src/lib/db/pages.ts`) utilisent déjà le moteur générique ADR-013 (ligne fantôme `draft_of_id`). L'aperçu (« Aperçu ») réutilise le même composant en `mode="preview"` (lit le brouillon, sans les affordances d'édition) plutôt qu'une route ou un rendu séparé — un second bouton, pas un second système.

**Conséquences.**
- Chaque nouvelle page rendue par l'éditeur doit accepter la prop `mode` et rester un composant partagé avec le public — jamais un formulaire admin classique écrit indépendamment (ce que Boris rejetait explicitement : « ça ne doit jamais ressembler à un simple formulaire admin »).
- Les 3 pages non câblées cette phase (Travail, À propos, Contact) utilisent la MÊME `EditorToolbar.astro` (avec `available={false}`) pour que la navigation entre les 5 pages en restant en mode édition soit réelle dès maintenant, même là où le contenu n'est pas encore éditable — sans dupliquer la barre d'outils.
- Si une future phase a besoin d'éditer une page qui n'a pas encore de composant partagé public/admin propre (ex. Travail avec ses compositions de galerie, ADR-014), il faudra d'abord s'assurer que ce composant existe sous cette forme partagée avant d'y brancher l'éditeur — pas construire une vue d'édition séparée.

**Alternatives écartées.**
- **Option A (édition sur les URLs publiques)** — écartée, voir ci-dessus (exigerait un nouveau mécanisme de session, hors périmètre).
- **Dupliquer HomeView en une « HomeEditorView »** — écartée explicitement par la contrainte de Boris ; aurait aussi réintroduit exactement le risque de dérive que `docs/decisions/ADR-002-visual-editor-vs-page-builder.md` cherche à éviter (deux rendus qui divergent avec le temps).
