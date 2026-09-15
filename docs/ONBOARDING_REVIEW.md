> **Note de mise à jour (15 septembre 2026) :** les Phases 0-2 ont depuis été finalisées avec des décisions qui modifient certains points ci-dessous. En particulier, **la section 5 (Données)** de cette revue discutait des trous du modèle « Projects » — ce modèle n'est plus le cœur du MVP : la page Travail repose désormais sur une sélection curatée de médias (`work_items`), pas sur des projets individuels publiés. Voir `docs/decisions/ADR-003-curated-work-vs-project-model.md` et `docs/CMS_SPEC.md` pour le modèle actuel — y compris un point resté ouvert : le garde-fou « autorisation de publication » n'a pas encore d'équivalent acté sur `work_items`. Le reste de cette revue (architecture technique, sécurité, bilinguisme, tests, leçons tirées de l'ancien projet) reste valide et n'est pas affecté par ce changement. Ce document est conservé tel quel ci-dessous comme trace de l'analyse initiale, conformément au principe « pas de modification silencieuse » (section 78 du Master Brief).

---

# DIVINE MOTION V2 — CLAUDE CODE ONBOARDING REVIEW

**Statut :** revue de cadrage — aucun code produit à ce stade, conformément à la section 104 du brief.
**Base d'analyse :** le Master Project Brief v2.0, ainsi qu'une lecture du dépôt de l'ancien projet (`borisglazai/Site-Internet-DM`) — README, `PROJECT_MAP.md`, `package.json`, `DATA_MODEL.md`, `AUTH_TRUST_MODEL.md`. Le dépôt `V2-Divine-Motion` était vide au moment de cette revue.

---

## 1. Compréhension du projet

Divine Motion V2 n'est pas un projet de refonte incrémentale : c'est la reconstruction complète, sur une base de code neuve, d'un site vitrine + CMS + éditeur visuel pour un studio de photographie/vidéographie en croissance. L'objectif produit est simple à énoncer et exigeant à tenir : convaincre un visiteur en quelques secondes qu'il a affaire à un vrai professionnel (« VOIR → RESSENTIR → COMPRENDRE → ÊTRE RASSURÉ → CONTACTER »), avec un minimum de pages mais un maximum de qualité éditoriale, en français et en anglais dès le départ, tout en donnant à Divine Motion (non technique) les moyens d'entretenir seul le contenu via un éditeur visuel volontairement borné — un **Visual Content Editor**, pas un page builder.

L'ancien projet (`Site-Internet-DM`) n'est pas une v1 « normale » d'un site Cloudflare : c'est en réalité une application Next.js/vinext hébergée via une plateforme tierce (« ChatGPT Sites », authentification par en-tête injecté par un dispatcher externe — voir section 8). Ce n'est ni l'architecture cible, ni un point de départ technique viable. Cela confirme et renforce la décision « V2 = codebase neuve ».

## 2. Principes que je considère non négociables

- **Codebase neuve** — aucune réutilisation d'architecture, de composants ou de modèle d'état de l'ancien projet sans justification explicite.
- **Visual Editor ≠ Page Builder** — pas de position libre, pas de CSS arbitraire, pas de colonnes libres.
- **Mêmes composants pour l'admin et le public** (WYSIWYG réel, pas deux moteurs de rendu séparés).
- **Bilinguisme dès le MVP**, jamais ajouté après coup.
- **R2 = master de publication, pas l'archive RAW** ; transformations via Cloudflare Images, pas de pipeline maison.
- **Autorisation de publication** comme garde-fou obligatoire avant mise en ligne d'un contenu contenant des personnes identifiables.
- **Minimisation des données** pour le formulaire de contact (pas de stockage D1 par défaut).
- **Aucun changement structurant sans validation** (stack, auth, routing, modèle de publication, design system) — Claude propose, ne décide pas seul.
- **Peu de pages, très soignées** plutôt que beaucoup de pages moyennes.
- **GitHub = source de vérité**, avec migrations D1 versionnées et ADR pour toute décision durable.

## 3. Architecture technique

**Points solides**

- Astro pour un site majoritairement éditorial/SEO avec JS minimal est un bon choix.
- Cloudflare Workers + D1 + R2 + Images + Access + Turnstile forme un ensemble cohérent, à un seul fournisseur.
- Le refus explicite de multiplier les backends est sain pour un projet de cette taille.

**Risques à traiter explicitement (ADR avant Phase 3)**

1. **Où vit l'admin/éditeur visuel dans Astro ?** Îlots Astro (composants React/Preact/Svelte en `client:load`) partageant l'arbre de composants avec le site public, dans le même dépôt/Worker — c'est l'option qui rend réellement possible le principe WYSIWYG de la section 33.
2. **Un seul Worker ou plusieurs ?** Un Cron Trigger Worker distinct pour la purge de la corbeille médias sera nécessaire.
3. **Upload de fichiers volumineux (~24 Mpx).** Prévoir un flux d'upload direct vers R2 (URL présignée) plutôt qu'un proxy par le Worker.
4. **Cloudflare Images vs Image Resizing** sont deux produits distincts avec des modèles de coût différents : à choisir explicitement.

## 4. Visual Editor

- **Page Builder** = mise en page libre. Rejeté.
- **Visual Content Editor** = édition de contenu dans des emplacements prédéfinis, structure figée dans le code.

L'ancien projet utilisait déjà des composants partagés, et a quand même dérivé vers un éditeur trop ambitieux, parce que le contenu éditable (`cms_settings`, JSON libre jusqu'à 180 000 caractères) n'était pas typé. **Leçon la plus importante** : le garde-fou contre la dérive page builder doit être dans le schéma de données, pas seulement dans l'UI.

## 5. Données

Trous identifiés (au moment de cette revue, sur le modèle Projects alors envisagé) : absence de champ de point focal sur `media` ; `featured` seul insuffisant pour ordonner la sélection homepage ; autorisation de publication limitée aux projets (devrait couvrir témoignages/équipe) ; protection anti-suppression fragile si le contenu de page reste un blob JSON ; absence de contraintes FK dans le schéma de l'ancien projet.

> Voir la note de mise à jour en tête de document : le modèle de référence a changé (Travail curaté / `work_items`), mais ces mêmes principes (point focal, garde-fou de publication étendu, contenu typé pour une protection anti-suppression fiable, FK) restent valables et s'appliquent maintenant à `work_items`.

## 6. Médias

L'approche **R2 (master web) → Cloudflare Images (transformations à la demande) → CDN** est la bonne direction, à l'opposé du pipeline maison de l'ancien projet (colonnes `original/thumbnail/mobile/desktop`).

À clarifier avant Phase 4 : choix Cloudflare Images vs Image Resizing ; flux d'upload présigné ; mécanisme de purge de la corbeille ; ADR documentant le principe « pas l'archive RAW ».

## 7. Bilinguisme

Structure d'URL standard, supportée nativement par Astro (`prefixDefaultLocale: false`). À anticiper : état « langue en cours d'édition » explicite dans l'éditeur ; hreflang/sitemap/canonical par langue ; e-mails transactionnels dans la bonne langue.

## 8. Sécurité et confidentialité

**Point critique tiré de l'ancien projet, à ne pas reproduire :** son modèle de confiance admin reposait entièrement sur un en-tête HTTP (`oai-authenticated-user-email`) injecté par un dispatcher externe, sans vérification cryptographique côté application — un risque résiduel explicitement documenté et non résolu dans `AUTH_TRUST_MODEL.md` de l'ancien projet. Cloudflare Access pour V2 est structurellement plus sain (JWT signé et vérifiable côté Worker), mais la vérification doit être réelle côté Worker, jamais une confiance implicite dans un en-tête.

Autres points : Loi 25 (Québec) — transferts hors Québec via Cloudflare/Postmark/Resend, EFVP/PFIA à planifier ; tension minimisation vs observabilité du formulaire de contact (journalisation minimale sans PII recommandée) ; droits de publication à étendre au-delà des projets.

## 9. Git / CI / environnements

Stratégie `main ← staging ← feature/*` avec D1/R2 isolés par environnement : saine. Manquait une pipeline CI explicite (lint/typecheck/tests/build sur PR) — recommandation retenue depuis dans la mise à jour du 15 septembre 2026.

## 10. Tests

Parcours critiques prioritaires : frontière admin/Access ; garde-fou d'autorisation de publication ; cohérence draft/publié FR/EN indépendante ; upload haute résolution via flux présigné ; protection anti-suppression de médias utilisés ; formulaire de contact ; routing i18n ; persistance complète.

## 11. Long terme

Verrouillage volontaire chez Cloudflare (assumé, à documenter en ADR) ; dénormalisation FR/EN par colonnes (soutenable à 2 langues) ; discipline sur le typage du contenu éditable (risque de dette le plus important, exactement le point où l'ancien projet a dérivé) ; évolution rapide de l'écosystème Astro/Cloudflare (pinning de versions recommandé).

## 12. Décisions que je recommande de clarifier avant développement (Phase 2/3)

1. Architecture admin/éditeur dans Astro (îlots partageant les composants publics).
2. Contenu éditable typé et validé, pas un blob JSON générique.
3. Choix explicite Cloudflare Images vs Image Resizing.
4. Flux d'upload présigné direct vers R2.
5. Droits de publication étendus au-delà des projets.
6. Journalisation minimale sans PII du formulaire de contact.
7. Pipeline CI explicite.
8. Planification d'une EFVP/PFIA (Loi 25).

## 13. Questions bloquantes (au moment de cette revue)

1. Typographies réelles à choisir pour le Design System.
2. Logo/identité de marque existante ou à créer.
3. Référence visuelle dominante parmi les trois citées.

> Ces trois points ont depuis été traités dans la mise à jour du 15 septembre 2026 (typographie proposée, direction Dark Editorial validée) — voir `docs/DESIGN_SYSTEM.md`.

## 14. Recommandation finale

Oui — cette architecture constituait une bonne base pour construire Divine Motion V2, à condition de résoudre avant la Phase 3 les points de la section 12 — en particulier le typage strict du contenu éditable et l'architecture précise de l'éditeur dans Astro.
