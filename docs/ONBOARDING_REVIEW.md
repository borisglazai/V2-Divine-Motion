# DIVINE MOTION V2 — CLAUDE CODE ONBOARDING REVIEW

**Statut :** revue de cadrage — aucun code produit à ce stade, conformément à la section 104 du brief.
**Base d'analyse :** le Master Project Brief v2.0, ainsi qu'une lecture du dépôt de l'ancien projet (`borisglazai/Site-Internet-DM`) — README, `PROJECT_MAP.md`, `package.json`, `DATA_MODEL.md`, `AUTH_TRUST_MODEL.md`. Le dépôt `V2-Divine-Motion` est actuellement vide : aucune contrainte de code existant ne pèse sur les décisions ci-dessous.

---

## 1. Compréhension du projet

Divine Motion V2 n'est pas un projet de refonte incrémentale : c'est la reconstruction complète, sur une base de code neuve, d'un site vitrine + CMS + éditeur visuel pour un studio de photographie/vidéographie en croissance. L'objectif produit est simple à énoncer et exigeant à tenir : convaincre un visiteur en quelques secondes qu'il a affaire à un vrai professionnel (« VOIR → RESSENTIR → COMPRENDRE → ÊTRE RASSURÉ → CONTACTER »), avec un minimum de pages mais un maximum de qualité éditoriale, en français et en anglais dès le départ, tout en donnant à Divine Motion (non technique) les moyens d'entretenir seul le contenu via un éditeur visuel volontairement borné — un **Visual Content Editor**, pas un page builder.

L'ancien projet (`Site-Internet-DM`) n'est pas une v1 « normale » d'un site Cloudflare : c'est en réalité une application Next.js/vinext hébergée via une plateforme tierce (« ChatGPT Sites », authentification par en-tête injecté par un dispatcher externe — voir section 8). Ce n'est ni l'architecture cible, ni un point de départ technique viable. Cela confirme et renforce la décision « V2 = codebase neuve » : il ne s'agit pas seulement d'éviter une dette technique accumulée, mais de sortir d'une dépendance d'hébergement qui n'est pas celle visée pour V2 (Cloudflare direct).

## 2. Principes que je considère non négociables

- **Codebase neuve** — aucune réutilisation d'architecture, de composants ou de modèle d'état de l'ancien projet sans justification explicite.
- **Visual Editor ≠ Page Builder** — pas de position libre, pas de CSS arbitraire, pas de colonnes libres.
- **Mêmes composants pour l'admin et le public** (WYSIWYG réel, pas deux moteurs de rendu séparés).
- **Bilinguisme dès le MVP**, jamais ajouté après coup.
- **R2 = master de publication, pas l'archive RAW** ; transformations via Cloudflare Images, pas de pipeline maison.
- **Autorisation de publication** comme garde-fou obligatoire avant mise en ligne d'un projet contenant des personnes identifiables.
- **Minimisation des données** pour le formulaire de contact (pas de stockage D1 par défaut).
- **Aucun changement structurant sans validation** (stack, auth, routing, modèle de publication, design system) — Claude propose, ne décide pas seul.
- **Peu de pages, très soignées** plutôt que beaucoup de pages moyennes.
- **GitHub = source de vérité**, avec migrations D1 versionnées et ADR pour toute décision durable.

## 3. Architecture technique

**Points solides**

- Astro pour un site majoritairement éditorial/SEO avec JS minimal est un bon choix : c'est exactement le profil pour lequel Astro est optimisé (contenu + performance + hydratation sélective).
- Cloudflare Workers + D1 + R2 + Images + Access + Turnstile forme un ensemble cohérent, à un seul fournisseur, ce qui simplifie considérablement l'exploitation par rapport à l'ancien projet (qui dépendait en plus d'une couche d'hébergement tierce non standard).
- Le refus explicite de multiplier les backends est sain pour un projet de cette taille.

**Risques à traiter explicitement (pas des blocages, mais des décisions à documenter en ADR avant Phase 3)**

1. **Où vit l'admin/éditeur visuel dans Astro ?** Astro n'est pas conçu nativement pour une interface d'administration riche et interactive. Il faut trancher : îlots Astro (composants React/Preact/Svelte en `client:load`) partageant l'arbre de composants avec le site public, dans le même dépôt/Worker — c'est l'option qui rend réellement possible le principe WYSIWYG de la section 33. Une SPA d'admin séparée casserait ce principe. Cette décision conditionne toute l'architecture du CMS et devrait être un ADR explicite (« ADR-002 » mentionné dans le brief est le bon véhicule).
2. **Un seul Worker ou plusieurs ?** Le brief dit « éviter la multiplication de backends inutiles », mais certaines tâches (purge de la corbeille médias après délai de rétention, éventuels batchs de maintenance) appelleront naturellement un Cron Trigger Worker distinct. Ce n'est pas une contradiction, mais il faut le documenter dès l'architecture technique pour ne pas le découvrir en Phase 4-5.
3. **Upload de fichiers volumineux (~24 Mpx).** Un Worker a des limites de taille de requête/CPU. Faire transiter un JPEG haute résolution par le Worker avant de l'écrire dans R2 est fragile. Il faut prévoir dès la conception un flux d'upload direct vers R2 (URL présignée), le Worker ne faisant que générer l'URL et enregistrer les métadonnées — l'ancien projet ne semble pas avoir fait ce choix (il stockait plusieurs tailles pré-générées en colonnes `original/thumbnail/mobile/desktop`), exactement le type de pipeline maison que la section 38 veut éviter.
4. **Cloudflare Images vs Image Resizing** sont deux produits Cloudflare distincts avec des modèles de coût différents (stockage géré par image vs redimensionnement à la volée sur un plan Pro). Le brief les nomme un peu comme équivalents (« Cloudflare Images » section 45, « transformations à la demande » section 38) : il faut choisir explicitement lequel, car cela a un impact budgétaire et d'implémentation.

## 4. Visual Editor

Je comprends la distinction ainsi :

- **Page Builder** = l'utilisateur compose librement la mise en page (position, grille, colonnes, styles) : le design devient une variable que chaque utilisateur peut casser. C'est le modèle Webflow/Elementor que le brief rejette explicitement.
- **Visual Content Editor** = le design system et la composition sont figés dans le code ; l'utilisateur édite uniquement le **contenu** à l'intérieur d'emplacements prédéfinis (texte, image, lien de bouton, visibilité d'une section, sélection de contenu mis en avant). La structure ne peut pas être cassée parce qu'elle n'est simplement pas exposée à l'édition.

Point important tiré de l'ancien projet : celui-ci utilisait déjà en partie le bon principe (même composant de rendu public avec un flag `editable=true`), et pourtant l'éditeur est devenu « trop ambitieux » avec le temps (deux générations visibles dans les scripts de test : `test:editor` / `test:nav` puis `test:v2` / `test:v2-nav`, signe d'une réécriture complète déjà effectuée une fois). La cause la plus probable n'est donc pas l'absence de composants partagés, mais le fait que le contenu éditable (`cms_settings`, JSON libre par clé, jusqu'à 180 000 caractères) n'était pas typé de façon stricte : un blob JSON libre dérive naturellement, avec le temps, vers un page builder de facto, même si l'intention initiale était un content editor. **C'est la leçon la plus importante à retenir de l'ancien projet pour V2** : le garde-fou contre la dérive page builder n'est pas seulement dans l'UI, il doit être dans le schéma de données (contenu typé et validé par section/composant, pas un blob générique).

## 5. Données

Les modèles conceptuels (projects, project_media, services, testimonials) sont cohérents avec les principes produit. Trous identifiés par comparaison avec le schéma réel de l'ancien projet :

- **Point focal d'image** — la section 31 mentionne « éventuellement régler point focal », mais aucun champ n'apparaît dans le modèle `media`. À ajouter si le recadrage responsive art-directed est réellement souhaité au MVP, sinon à écarter explicitement.
- **Sélection « Selected Work »** — `featured` en booléen sur `projects` (comme dans l'ancien projet) ne permet pas un ordre de mise en avant indépendant du statut du projet. Une petite table ou un champ `position` dédié à la sélection homepage est plus robuste et évite de coupler « vedette » et « ordre d'affichage ».
- **Autorisation de publication limitée aux projets** — les témoignages et les photos d'équipe peuvent aussi montrer des personnes identifiables (client cité nommément avec sa photo). Le même garde-fou (section 21) devrait s'appliquer à `testimonials.photo_media_id`, pas seulement à `projects`.
- **Protection des médias utilisés (section 36)** — pour être fiable, elle suppose de savoir, à tout moment, dans quelles tables/JSON un `media_id` est référencé. Si le contenu des pages (accueil, à propos, contact) reste un blob JSON flexible façon ancien projet, ce calcul devient difficile à garantir. Ceci renforce la recommandation de la section 4 : contenu de page typé, pas un blob libre — ce qui rend aussi la protection anti-suppression triviale à implémenter.
- **Pas de contrainte de clé étrangère** dans l'ancien schéma D1/SQLite : à corriger en V2 (D1 supporte les FK SQLite) pour éviter les références orphelines constatées comme risque dans `DATA_MODEL.md` de l'ancien projet.

## 6. Médias

L'approche **R2 (master web) → Cloudflare Images (transformations à la demande) → CDN** est la bonne direction : elle évite exactement le type de pipeline que l'ancien projet avait construit à la main (colonnes `original/thumbnail/mobile/desktop` pré-générées dans `media`), qui est plus de code, plus de stockage dupliqué, et plus de surface de bug.

Points à clarifier avant Phase 4 :
- Choix explicite entre Cloudflare Images et Image Resizing (section 3.4 ci-dessus).
- Flux d'upload direct vers R2 par URL présignée pour les fichiers lourds (section 3.3).
- Mécanisme concret de purge de la corbeille après la période de rétention (Cron Trigger), et test de restauration documenté (sections 39 et 85) — actuellement une intention, pas une spécification.
- Le principe « le site n'est pas l'archive RAW » est sain et réduit le risque de responsabilité et de coût de stockage ; à documenter en ADR pour éviter qu'un futur contributeur ne « simplifie » en uploadant les RAW par confort.

## 7. Bilinguisme

La structure d'URL proposée (racine FR sans préfixe, `/en` préfixé) est un schéma standard qu'Astro supporte nativement via son i18n routing (`prefixDefaultLocale: false`), donc pas de risque technique particulier. Conséquences à anticiper dès la conception, pas après :

- Chaque table de contenu porte des paires `_fr/_en` (dénormalisé plutôt qu'une table de traductions générique) — cohérent avec le principe de simplicité, acceptable tant qu'il est acté qu'aucune troisième langue n'est prévue (à noter en ADR, car une dénormalisation par colonnes ne scale pas au-delà de 2-3 langues sans migration).
- L'éditeur visuel doit exposer clairement « quelle langue est en cours d'édition » comme état de premier plan, pas comme un détail d'UI — sinon risque réel de publier du contenu FR par erreur en éditant EN (ou l'inverse).
- hreflang, sitemap par langue, canonical, et e-mails transactionnels (accusé de réception du formulaire) doivent respecter la langue du visiteur.

## 8. Sécurité et confidentialité

**Point critique tiré de l'ancien projet, à ne pas reproduire :** son modèle de confiance admin reposait entièrement sur un en-tête HTTP (`oai-authenticated-user-email`) injecté par un dispatcher externe à la plateforme « ChatGPT Sites », sans vérification cryptographique côté application — un risque résiduel explicitement documenté et non résolu dans `AUTH_TRUST_MODEL.md` de l'ancien projet (« si un chemin quelconque permet à un client de positionner lui-même cet en-tête... accès complet immédiat au CMS »). Cloudflare Access pour V2 est structurellement plus sain (JWT signé et vérifiable côté Worker), mais cela doit rester un point de vigilance explicite en Phase 4-5 : vérifier réellement la signature du JWT Access côté Worker, ne jamais faire confiance à un en-tête non signé.

Autres points à traiter concrètement :
- **Loi 25 (Québec) — transferts hors Québec.** Cloudflare (infrastructure mondiale), et les fournisseurs d'e-mail transactionnel envisagés (Postmark, Resend) sont des entreprises américaines. La collecte de nom/courriel/téléphone/date d'événement via le formulaire de contact constitue un renseignement personnel transféré hors Québec dès qu'il transite par R2, D1, Cloudflare Images ou un service d'e-mail américain. La section 19 du brief le mentionne déjà comme point d'attention ; je le remonte comme **action concrète à planifier** : une évaluation des facteurs relatifs à la vie privée (EFVP/PFIA) documentée avant mise en production, pas seulement « à garder en tête ».
- **Tension minimisation vs observabilité (sections 20 et 58).** Le flux préféré (formulaire → Turnstile → backend → e-mail, sans stockage D1) est bon pour la minimisation, mais rend difficile la détection d'une panne silencieuse du formulaire. Recommandation : journaliser un événement minimal sans donnée personnelle (horodatage, succès/échec d'envoi) à des fins de supervision uniquement, distinct d'un enregistrement de lead — cela concilie les deux exigences sans contredire le principe de minimisation.
- **Droits de publication** (section 21) à étendre aux témoignages/équipe, comme noté en section 5.
- Le reste (Turnstile, validation MIME, SQL paramétré, secrets hors Git, moindre privilège) est standard et bien couvert par le brief — pas de risque particulier à signaler au-delà de l'exécution disciplinée.

## 9. Git / CI / environnements

La stratégie `main ← staging ← feature/*` avec D1/R2 isolés par environnement est saine et standard ; je ne la remets pas en cause. Un point manque cependant dans le brief : **aucune pipeline CI n'est explicitement spécifiée**. Recommandation : GitHub Actions exécutant lint + typecheck + tests + build Astro sur chaque PR vers `staging`, avec un déploiement preview (Workers/Pages preview URL) pour la QA visuelle avant fusion — cela évite de découvrir une régression seulement après merge, et s'aligne avec la section 80 (« gestion par lots », pas de déploiements bug-fix-deploy en boucle). À ajouter à `TECHNICAL_ARCHITECTURE.md`/`DEPLOYMENT.md` en Phase 0-1.

Isolation des environnements (D1/R2 séparés) a un coût opérationnel réel (migrations à rejouer deux fois, secrets dupliqués, données de test à maintenir) : c'est un coût accepté et justifié par la section 60, pas un point à alléger, mais à ne pas laisser dériver sans automatisation.

## 10. Tests

Parcours critiques à prioriser, dans cet ordre de risque :

1. **Frontière admin/Access** — c'est précisément là que l'ancien projet portait son risque résiduel non résolu ; tout changement touchant l'auth doit avoir un test qui prouve qu'un visiteur non authentifié ne peut atteindre aucune route `/api/admin/*` ni l'éditeur.
2. **Garde-fou d'autorisation de publication** — impossible de publier un projet (ou un témoignage) sans le flag confirmé.
3. **Cohérence draft/publié en FR et EN indépendamment** — publier en FR ne doit pas publier accidentellement un brouillon EN, et vice-versa.
4. **Upload de média haute résolution (~24 Mpx) via le flux présigné**, y compris erreurs réseau et retry.
5. **Protection anti-suppression d'un média utilisé** (section 36), sur les différentes surfaces qui peuvent le référencer.
6. **Formulaire de contact** — Turnstile, validation serveur, envoi e-mail, et détection d'échec silencieux (voir section 8).
7. **Routing i18n** — redirection de langue par défaut, hreflang, canonical, sitemap par langue.
8. **Persistance complète** (upload → contenu → reload → logout/login), telle que décrite section 85.

## 11. Long terme

- **Verrouillage volontaire chez Cloudflare** (D1, R2, Images, Workers, Access) : c'est un choix assumé et cohérent pour un projet de cette taille, mais il doit être acté comme tel dans un ADR (« lock-in accepté, pas un oubli ») pour qu'un futur contributeur ne remette pas en cause l'architecture sans raison suffisante — exactement l'intention de la section 68.
- **Dénormalisation FR/EN par colonnes** : soutenable durablement seulement si le projet reste à deux langues, comme prévu — à documenter comme hypothèse figée.
- **Discipline sur le typage du contenu éditable** est le risque de dette le plus important à 2-5 ans : c'est le seul point où l'ancien projet a concrètement dérivé (voir section 4), et c'est un risque qui se construit progressivement, presque invisible commit par commit, jusqu'à devenir un page builder de fait. La meilleure protection est structurelle (schémas validés, ex. Zod, par section de page, vérifiés en CI), pas seulement une intention de design.
- **Évolution rapide de l'écosystème Astro/Cloudflare** (API de content collections, adaptateurs) : risque modéré, à mitiger par un pinning de versions et une cadence de mise à jour documentée plutôt que des mises à jour automatiques non testées.

## 12. Décisions que je recommande de clarifier avant développement (Phase 2/3)

Seulement celles qui ont un impact structurant réel :

1. **Architecture admin/éditeur dans Astro** — îlots partageant les composants publics, même dépôt/Worker (recommandé), à acter en ADR avant Phase 3.
2. **Contenu éditable typé et validé**, pas un blob JSON générique — condition nécessaire pour tenir la promesse « Visual Editor, pas Page Builder » dans la durée.
3. **Choix explicite Cloudflare Images vs Image Resizing**, avec impact budgétaire documenté.
4. **Flux d'upload présigné direct vers R2** pour les fichiers lourds, plutôt que proxy par le Worker.
5. **Droits de publication étendus** aux témoignages et à l'équipe, pas seulement aux projets.
6. **Journalisation minimale sans PII du formulaire de contact**, pour concilier minimisation et supervision (section 58).
7. **Pipeline CI explicite** (lint/typecheck/tests/build + preview) à ajouter à la gouvernance Phase 0, absente du brief actuel.
8. **Planification d'une EFVP/PFIA (Loi 25)** comme tâche datée avant Phase 9, pas comme note d'intention.

Aucune de ces décisions ne remet en cause la stack ni les principes produit — elles précisent des choix que le brief laisse ouverts et qui coûteraient cher à corriger après coup.

## 13. Questions bloquantes (uniquement celles nécessaires avant Phase 2/3)

1. **Typographies réelles.** Le brief fixe la direction (serif éditoriale + sans-serif, deux familles max) mais ne nomme aucune police. Le Design System (Phase 2) ne peut pas être maquetté sans ce choix — qui le propose (ChatGPT/Claude) et qui valide (Boris) ?
2. **Logo / identité de marque existante.** Divine Motion dispose-t-il déjà d'un logo/wordmark utilisable, ou une création graphique fait-elle aussi partie du scope V2 ? Cela conditionne le header et le hero dès la Phase 3 (frontend avec données mockées).
3. **Référence visuelle dominante.** Trois références sont citées (Cagdas Yoldas, Scott Snyder, Bottega53) sans hiérarchie. Une seule référence d'ancrage principal (les autres en complément) faciliterait des maquettes Phase 2 cohérentes plutôt que trois directions concurrentes.

Je ne pose pas de question sur le nom de domaine, le fournisseur d'e-mail transactionnel ou la liste des administrateurs : ce sont des décisions réelles mais elles n'empêchent pas d'avancer sur le Design System (Phase 2) ni sur le frontend à données mockées (Phase 3).

## 14. Recommandation finale

Oui — cette architecture constitue une bonne base pour construire Divine Motion V2. Elle est cohérente, correctement scopée pour la taille du projet, et surtout gouvernée avec une rigueur (phases, ADR, rôles, freezes) qui manquait visiblement à l'ancien projet et qui explique une bonne partie de sa dette. Le choix de repartir sur une codebase neuve est justifié aussi bien par la dette accumulée que par le fait que l'ancien projet n'était même pas hébergé sur l'architecture cible.

Cette recommandation est conditionnée à la résolution, avant le début de la Phase 3 (frontend), des points de la section 12 — en particulier le typage strict du contenu éditable et l'architecture précise de l'éditeur dans Astro, qui sont les deux décisions les plus coûteuses à corriger rétroactivement et les plus directement liées à la leçon principale tirée de l'ancien projet.

Prochaine étape proposée : finaliser la Product & UX Specification (Phase 1) en intégrant les clarifications de la section 13, puis passer au Design System (Phase 2). Aucun développement ne démarre avant un Implementation Brief spécifique, conformément à la section 76.
