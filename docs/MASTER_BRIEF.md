# MISE À JOUR OFFICIELLE — 15 septembre 2026 (Phases 0, 1, 2 finalisées)

Ce document a été mis à jour pour refléter les décisions produit/UX/design finalisées après l'Onboarding Review. Le texte original du brief (ci-dessous, section 0 et suivantes) reste conservé tel quel pour traçabilité, conformément au principe « pas de modification silencieuse » (section 78). Les points suivants le remplacent ou le précisent explicitement :

- **Sections 11 et 14-15 (Architecture publique / Page Travail / Projet individuel) — REMPLACÉES.** Le MVP n'est plus construit autour d'un modèle « Projects » avec pages individuelles. La page Travail devient une **vitrine éditoriale curatée** : Médiathèque → Sélection de médias → Page Travail. Les pages projet individuelles sont retirées du MVP. Voir `docs/decisions/ADR-003-curated-work-vs-project-model.md`, `docs/CMS_SPEC.md` et `docs/INFORMATION_ARCHITECTURE.md`.
- **Sections 40-41 (Modèle Projet / Galerie projet) — REMPLACÉES** par le modèle `work_items` documenté dans `docs/CMS_SPEC.md` et détaillé dans `docs/DATA_ARCHITECTURE.md` (Phase 4, Brief 009). Le garde-fou « autorisation de publication » (section 21 ci-dessous) est reporté sur `work_items`/`testimonials` — voir `docs/decisions/ADR-011-publication-rights-model.md`.
- **Section 22 (Design System, couleurs) — REMPLACÉE.** Direction visuelle validée : **Dark Editorial**. Palette de référence dans `docs/DESIGN_SYSTEM.md`.
- **Section 23 (Typographie) — PRÉCISÉE.** Première combinaison à tester : Instrument Serif (display) + Manrope (interface), encore challengeable en finalisation Phase 2. La logique (serif = émotion, sans-serif = information) reste la règle durable.
- **Section 28 (Architecture admin) — REMPLACÉE.** Le module « Projets » n'est plus central. Nouvelle arborescence CMS : Dashboard, Modifier le site, Travail, Médias, Services, Témoignages, Contenu (Accueil/À propos/Contact), SEO, Paramètres. Voir `docs/CMS_SPEC.md`.
- **Section 12 (Bilinguisme) — PRÉCISÉE.** Ajout des routes `/confidentialite` et `/en/privacy`. Règle explicite : une page ne mélange jamais les langues ; un contenu EN incomplet n'est pas publié en EN (indépendamment du statut FR). Voir `docs/decisions/ADR-007-bilingual-i18n.md`.
- **Section 9 (Git/CI) — COMPLÉTÉE.** Pipeline CI minimale explicitement actée : install, lint, typecheck, tests, build sur chaque Pull Request ; aucun merge si un contrôle échoue. Voir `docs/decisions/ADR-010-ci-pipeline.md`.

Le détail complet des décisions produit/UX/design est dans les documents listés dans `README.md`, et les décisions structurantes sont actées dans `/docs/decisions` (ADR). Le texte ci-dessous est conservé tel quel comme référence historique du cadrage initial (version 2.0, septembre 2026).

---

# DIVINE MOTION V2
## MASTER PROJECT BRIEF — CLAUDE CODE

**Version :** 2.0
**Date de référence :** septembre 2026
**Projet :** reconstruction complète du site Divine Motion
**Statut actuel :** cadrage produit / UX / architecture — aucun développement V2 ne doit commencer sans spécification d'implémentation validée

---

## 0. À LIRE AVANT TOUT

Ce document constitue le brief maître d'onboarding de Claude Code pour Divine Motion V2.
Il explique :

* ce qu'est Divine Motion ;
* pourquoi une V2 complète est nécessaire ;
* la vision du nouveau site ;
* le positionnement de marque ;
* l'architecture fonctionnelle ;
* le CMS ;
* l'éditeur visuel ;
* l'architecture technique envisagée ;
* les règles de sécurité ;
* le traitement des médias ;
* le bilinguisme ;
* les obligations de confidentialité ;
* la gouvernance du projet ;
* la manière dont Claude Code doit travailler ;
* le workflow Git ;
* la stratégie staging/production ;
* les tests ;
* la maintenance long terme ;
* le rôle exact de Claude Code dans l'équipe.

Ce document n'est PAS une demande de développement immédiat.

### Instruction importante pour Claude Code

Ne commence pas à coder après avoir reçu ce document.
Ta première responsabilité est de :

1. comprendre le projet ;
2. comprendre les décisions déjà prises ;
3. identifier les incohérences éventuelles ;
4. identifier les risques techniques ;
5. proposer des améliorations si nécessaire ;
6. signaler clairement les décisions structurantes que tu souhaiterais challenger.

Toute implémentation réelle devra ensuite être précédée d'un Implementation Brief spécifique à la phase ou fonctionnalité concernée.

## 1. CONTEXTE

Divine Motion possède déjà un ancien projet de site internet.
Cet ancien projet a permis d'apprendre énormément :

* fonctionnement d'un CMS ;
* uploads médias ;
* Cloudflare ;
* D1 ;
* R2 ;
* éditeur visuel ;
* administration ;
* publication ;
* staging ;
* responsive ;
* médias haute résolution ;
* architecture frontend/backend.

Mais il a aussi accumulé progressivement :

* dette technique ;
* architecture devenue trop complexe ;
* visual editor trop ambitieux ;
* corrections successives ;
* interactions difficiles entre frontend et CMS ;
* trop de micro-modifications ;
* difficultés à maintenir une source de vérité claire ;
* fonctionnalités ajoutées progressivement sans architecture suffisamment figée.

Divine Motion V2 est donc un :

### NOUVEAU DÉPART COMPLET

Il ne s'agit PAS de refactoriser l'ancien site.
Il ne s'agit PAS de migrer l'ancien code.
Il ne s'agit PAS de réparer l'ancien visual editor.
Il ne s'agit PAS de construire la V2 par-dessus la V1.

## 2. UTILISATION AUTORISÉE DE L'ANCIEN PROJET

L'ancien projet peut servir uniquement comme :

* référence de contenu ;
* référence de marque ;
* mémoire des besoins ;
* documentation des erreurs rencontrées ;
* source d'apprentissage ;
* référence concernant certaines fonctionnalités utiles.

Il ne doit PAS servir comme base :

* frontend ;
* backend ;
* base de données ;
* visual editor ;
* composants ;
* API ;
* modèle d'état ;
* migrations ;
* architecture.

Toute réutilisation éventuelle de code doit être explicitement justifiée.

Par défaut : **V2 = CODEBASE NEUVE**

## 3. À PROPOS DE DIVINE MOTION

Divine Motion est une structure spécialisée dans la photographie et vidéographie.

Les prestations actuelles et futures comprennent notamment :

* mariages ;
* portraits ;
* shootings urbains ;
* lifestyle ;
* couples ;
* familles ;
* anniversaires ;
* événements privés ;
* événements professionnels ;
* productions visuelles.

Divine Motion est encore en croissance. Le portfolio continuera donc à se développer. Le site ne doit cependant jamais donner l'impression de présenter « un petit photographe débutant avec peu de contenu ». Le positionnement, l'expérience utilisateur et l'identité graphique doivent permettre à la marque de grandir progressivement sans nécessiter une refonte complète dans un an.

## 4. POSITIONNEMENT RECHERCHÉ

Divine Motion doit progressivement être perçu comme : un studio visuel spécialisé dans la photographie et le film, créant des images fortes, humaines, élégantes et cinématographiques autour des personnes, des événements et des moments de vie.

La marque doit évoquer : professionnalisme, maîtrise, sensibilité, authenticité, élégance, émotion, modernité, qualité, sérieux, chaleur humaine.

## 5. OBJECTIF DU SITE

Lorsqu'un visiteur arrive sur le site Divine Motion, l'objectif est qu'il pense immédiatement : « C'est un vrai professionnel. »

Le site doit répondre très rapidement aux questions suivantes : Que fait Divine Motion ? À quoi ressemble son travail ? Son style correspond-il à ce que je recherche ? Puis-je lui faire confiance ? Comment puis-je le contacter ?

## 6. PARCOURS PRINCIPAL

VOIR → RESSENTIR → COMPRENDRE → ÊTRE RASSURÉ → CONTACTER

Le site ne doit pas nécessiter une longue lecture avant que le visiteur comprenne l'offre. Les images sont prioritaires.

## 7. PRINCIPES PRODUIT

**7.1 Portfolio First** — Les photographies doivent vendre Divine Motion avant le marketing. Le texte accompagne les images, il ne doit pas les étouffer.

**7.2 Peu de pages** — 5 excellentes pages plutôt que 15 pages moyennes.

**7.3 Simplicité** — Chaque fonctionnalité doit avoir une justification. Pas de fonctionnalité simplement parce qu'elle est techniquement intéressante.

**7.4 Maintenabilité** — Un développeur extérieur doit pouvoir comprendre le projet plusieurs années plus tard.

**7.5 Pas de sophistication gratuite** — Toute complexité doit gagner le droit d'exister.

**7.6 Contenu ≠ Design** — L'utilisateur administre textes, photos, projets, services, contenus, SEO. Le design system contrôle grilles, typographies, espacements, responsive, animations, composition, cohérence générale.

**7.7 Pas de page builder** — Divine Motion V2 ne doit pas devenir un clone de Webflow, Elementor, Wix, Squarespace.

## 8. RÉFÉRENCES VISUELLES

Références principales étudiées : Cagdas Yoldas, Scott Snyder, Bottega53.

Ce qui nous intéresse chez eux : clarté, respiration, sophistication discrète, portfolio très fort, impression éditoriale, grandes images, typographie, simplicité de navigation, sentiment premium.

Divine Motion ne doit PAS les copier. Ils servent de références de niveau.

## 9. IDENTITÉ RECHERCHÉE

Direction : éditoriale, minimaliste, moderne, cinématographique, chaleureuse, premium, photographique.

L'interface doit ressembler davantage à un beau magazine visuel contemporain qu'à un template WordPress de photographe.

## 10. CE QUE LE DESIGN DOIT ÉVITER

Éviter : noir et or clichė, polices manuscrites wedding, cartes partout, icônes décoratives inutiles, interfaces ressemblant à un SaaS, animations spectaculaires, parallaxe excessive, sliders inutiles, carrousels automatiques, surcharge marketing, dizaines de CTA, sections qui existent uniquement pour remplir la page.

## 11. ARCHITECTURE PUBLIQUE

Navigation principale recommandée : Accueil, Travail, Services, À propos, Contact.

```text
/
├── travail
│   └── /travail/[projet]
├── services
├── a-propos
└── contact
```

Les projets individuels ne sont pas une entrée du menu principal.

> **Superseded** — voir la mise à jour en tête de ce document et `docs/decisions/ADR-003-curated-work-vs-project-model.md` : il n'y a plus de route `/travail/[projet]` au MVP.

## 12. BILINGUISME

Divine Motion doit être conçu FRANÇAIS + ANGLAIS dès le MVP. Le bilinguisme ne doit pas être ajouté après coup. Il doit influencer dès le départ : architecture URL, données, CMS, visual editor, SEO, sitemap, metadata, formulaires.

```text
/
├── travail
├── services
├── a-propos
└── contact

/en
├── work
├── services
├── about
└── contact
```

Les images peuvent être communes. Les contenus textuels doivent pouvoir être différents.

```text
title_fr / title_en
description_fr / description_en
seo_title_fr / seo_title_en
seo_description_fr / seo_description_en
```

Le CMS doit permettre de passer facilement : FR | EN

## 13. PAGE ACCUEIL

L'accueil doit rester relativement court.

**Hero** — Grande photographie forte, logo, navigation, courte proposition de valeur. CTA principal : « Découvrir notre travail ». CTA secondaire : « Parler de votre projet ». Pas de vidéo autoplay lourde au MVP.

**Selected Work** — 3 à 5 projets sélectionnés, pas une galerie aléatoire. Chaque élément représente un véritable projet.

**Brand Statement** — Quelques lignes maximum, exprimant la vision de Divine Motion.

**Univers** — Trois univers principaux : Mariages, Portraits & Lifestyle, Événements. La photographie et la vidéo sont des capacités transversales.

**Témoignages** — Quelques témoignages sélectionnés. Pas de faux awards, pas de faux logos.

**À propos** — Courte introduction, photo réelle / behind the scenes, CTA vers À propos.

**CTA final** — Grande image, courte phrase, CTA : « Parler de votre projet ».

> **Précisé** par la mise à jour du 15 septembre 2026 — voir `docs/UX_FLOWS.md` pour la structure finale de l'accueil.

## 14. PAGE TRAVAIL

Cœur du portfolio. Chaque élément correspond à un PROJET, non simplement à une photographie (mariage, séance urbaine, anniversaire, portrait, événement).

Filtres possibles : Tout, Mariages, Portraits & Lifestyle, Événements — uniquement lorsque le volume le justifie.

> **Superseded** — voir la mise à jour en tête de ce document. Travail est désormais une vitrine curatée de médias sélectionnés (`work_items`), pas une accumulation de projets. Voir `docs/CMS_SPEC.md` et ADR-003.

## 15. PROJET INDIVIDUEL

Une page projet doit raconter une histoire : couverture, titre, catégorie, date, lieu, texte très court, galerie, séquençage visuel, vidéo éventuelle, projet suivant, CTA contact.

L'ordre des médias doit pouvoir être contrôlé manuellement.

> **Superseded — retiré du MVP.** Les pages projet individuelles n'existent plus au MVP (voir ADR-003). Une fonctionnalité « Stories / Histoires » pourra éventuellement réintroduire des pages narratives plus tard ; elle est hors scope aujourd'hui.

## 16. SERVICES

Trois groupes principaux : Mariages, Portraits & Lifestyle, Événements. Les services doivent rester structurés ; pas de page indépendante pour chaque micro-prestation au MVP.

## 17. À PROPOS

Objectifs : humaniser Divine Motion, expliquer la philosophie, présenter la manière de travailler, présenter l'expérience client, présenter éventuellement l'équipe. Ce n'est pas un CV.

## 18. CONTACT

Formulaire volontairement court : nom, courriel, téléphone facultatif, type de projet, date éventuelle, lieu, message.

Le formulaire doit être simple, rassurant, accessible, sécurisé, protégé contre le spam.

> **Précisé** — le champ « type de projet » devient « type de prestation » avec options fermées (Mariage / Portrait-Lifestyle / Événement / Autre). Voir `docs/UX_FLOWS.md`.

## 19. CONFIDENTIALITÉ

La conformité à la protection des renseignements personnels fait partie du produit ; elle ne doit pas être ajoutée après le développement.

Le MVP doit prévoir : politique de confidentialité publique, collecte minimale, information claire au formulaire, conservation limitée, suppression lorsque nécessaire, protection des données, documentation des traitements.

Une analyse relative à la protection des renseignements personnels doit être menée avant la mise en production. Les choix techniques doivent tenir compte du fait que certains fournisseurs peuvent traiter des données hors Québec.

> **Précisé** — routes dédiées `/confidentialite` et `/en/privacy` actées. Voir `docs/SECURITY_PRIVACY.md`.

## 20. PRINCIPE DE MINIMISATION

Ne pas stocker automatiquement dans D1 toutes les demandes de contact simplement parce que nous pouvons le faire.

```text
Formulaire → Validation → Turnstile → Backend → Email Divine Motion
```

Si un CRM devient nécessaire plus tard, il fera l'objet d'une fonctionnalité distincte.

## 21. DROITS DE PUBLICATION DES PHOTOS

Divine Motion travaille avec des personnes identifiables. Chaque projet doit donc pouvoir contenir : « Autorisation de publication confirmée : Oui / Non ».

Un projet ne doit idéalement pas pouvoir être publié tant que cette autorisation n'est pas confirmée. Particulièrement important pour : mariages, familles, enfants, événements privés.

Le CMS n'a pas besoin de devenir un système de contrat ; il doit simplement éviter les publications accidentelles.

> **Résolu en Phase 4** — ce garde-fou est reporté sur `work_items` et `testimonials` via une référence à `media.publication_rights_confirmed`, appliquée à la publication par un trigger D1. Voir `docs/decisions/ADR-011-publication-rights-model.md`.

## 22. DESIGN SYSTEM

Direction générale proposée : Fond ivoire `#F4F1EB`, Fond beige `#E8E2D8`, Texte `#181817`, Texte secondaire `#6D675F`.

Ces couleurs ne sont pas encore figées tant que Phase 2 n'est pas validée.

> **Superseded** — Phase 2 a validé une direction Dark Editorial. Voir `docs/DESIGN_SYSTEM.md` pour la palette actuelle.

## 23. TYPOGRAPHIE

Deux familles maximum. Serif éditoriale pour grands titres/accroches/moments émotionnels. Sans-serif pour navigation/interface/corps/boutons/CMS.

> **Précisé** — première combinaison proposée : Instrument Serif + Manrope. Voir `docs/DESIGN_SYSTEM.md`.

## 24. ANIMATIONS

Animations discrètes, environ 150 à 400 ms.

Accepté : fade, déplacement léger, crop subtil, hover, transitions simples.
Refusé : scroll hijacking, animations bloquantes, loaders décoratifs, parallaxe excessive.

## 25. ACCESSIBILITÉ

Objectif : WCAG 2.2 AA. Critères testables incluant contraste, clavier, focus, alt text, labels, tailles de cibles, structure sémantique, messages d'erreur, formulaires.

## 26. RESPONSIVE

Le site doit fonctionner parfaitement sur smartphone, tablette, laptop, desktop, grands écrans. Mobile ne signifie pas desktop réduit ; certaines compositions peuvent changer.

> **Précisé** — grille 12/8/4 colonnes (desktop/tablette/mobile). Voir `docs/DESIGN_SYSTEM.md`.

## 27. CMS

Le CMS doit être simple, stable, structuré, visuel, robuste. Il ne doit PAS être un CMS universel.

## 28. ARCHITECTURE ADMIN

```text
Dashboard
Modifier le site
Contenu (Accueil, À propos, Contact)
Projets
Services
Médias
SEO
Paramètres
```

> **Superseded** — voir `docs/CMS_SPEC.md` pour l'arborescence actuelle (Travail remplace Projets).

## 29. ÉDITEUR VISUEL

L'éditeur visuel est UNE FONCTIONNALITÉ FONDAMENTALE DU MVP, pas une option future. L'administrateur doit pouvoir cliquer sur « Modifier le site » et voir un rendu très proche du véritable site public.

## 30. PHILOSOPHIE DE L'ÉDITEUR

VISUAL CONTENT EDITOR : Oui. PAGE BUILDER : Non.

## 31. CE QUI DOIT ÊTRE MODIFIABLE VISUELLEMENT

**Textes** — Cliquer sur titre/paragraphe/CTA/légende puis modifier.

**Images** — Cliquer sur une image puis remplacer/importer/choisir dans la médiathèque/modifier alt text/éventuellement régler point focal.

**Boutons** — Modifier texte/lien.

**Sections** — Certaines peuvent être affichées/masquées. Un réordonnement limité pourra exister uniquement si le design le prévoit.

**Featured Content** — Exemple : Selected Work. L'administrateur peut sélectionner quels projets apparaissent.

## 32. CE QUI NE DOIT PAS ÊTRE MODIFIABLE

Le Visual Editor ne doit PAS permettre : position absolue, déplacement au pixel, changement CSS, couleurs arbitraires, changement libre des fonts, tailles de police arbitraires, création libre de colonnes, modification profonde des grilles, composants imbriqués, création d'une page totalement libre.

## 33. WYSIWYG

Règle fondamentale : L'ÉDITEUR ET LE SITE PUBLIC DOIVENT PARTAGER LES MÊMES COMPOSANTS AUTANT QUE POSSIBLE. Pas d'`EditorRenderer` d'un côté et de `PublicRenderer` complètement différent de l'autre. Ce que l'administrateur voit doit correspondre à ce qui sera publié.

## 34. PRÉVISUALISATION

L'éditeur doit proposer Desktop, Tablette, Mobile. L'objectif n'est pas de modifier manuellement le CSS de chaque breakpoint — c'est une preview.

## 35. PUBLICATION

```text
Modifier → Sauvegarder en brouillon → Prévisualiser → Publier
```

Le système doit clairement différencier contenu sauvegardé et contenu publié.

## 36. MÉDIATHÈQUE

Fonctions MVP : upload, upload multiple, grille, recherche, tri, aperçu, dimensions, poids, alt text, date, utilisation, sélection.

Une image utilisée doit être protégée contre une suppression accidentelle.

## 37. PHOTOS : PRINCIPE IMPORTANT

Le site Divine Motion ne doit PAS devenir l'archive maître des fichiers clients.

```text
RAW / masters → Archive photographique Divine Motion → Export final haute qualité → R2 → Site
```

R2 contient donc principalement le MASTER WEB / PUBLICATION, et non nécessairement les RAW originaux de shooting.

## 38. TRANSFORMATION IMAGES

Ne pas développer un pipeline maison de génération thumbnail/medium/large/WebP/AVIF.

```text
Master web → R2 → Cloudflare Images → transformations à la demande → CDN → client
```

Objectif : moins de code.

## 39. SUPPRESSION DES MÉDIAS

Ne pas supprimer immédiatement physiquement un média à partir du CMS.

```text
Suppression demandée → Soft delete / corbeille → période de récupération → suppression physique
```

Une stratégie de sauvegarde/récupération doit être documentée.

## 40. MODÈLE PROJET

```text
projects
  id, slug, category_id
  title_fr, title_en
  summary_fr, summary_en
  cover_media_id
  event_date, location
  featured
  publication_rights_confirmed
  status
  seo_title_fr, seo_title_en
  seo_description_fr, seo_description_en
  created_at, updated_at, published_at
```

La version finale du schéma devra être définie dans Phase 4.

> **Superseded** — remplacé par le modèle `work_items`, voir `docs/CMS_SPEC.md` et ADR-003. Noter que `publication_rights_confirmed` n'a pas encore d'équivalent acté sur `work_items` — point ouvert.

## 41. GALERIE PROJET

```text
project_media
  project_id, media_id, position
  caption_fr, caption_en
```

L'ordre est contrôlé.

> **Superseded** par `work_items` (position, caption_fr/en portés directement par l'item). Voir `docs/CMS_SPEC.md`.

## 42. TÉMOIGNAGES

```text
testimonials
  id, client_name
  quote_fr, quote_en
  project_id (optional)
  photo_media_id (optional)
  featured, position, status
```

## 43. SERVICES

```text
services
  id, slug
  title_fr, title_en
  summary_fr, summary_en
  description_fr, description_en
  image_id, position, is_active
  SEO
```

## 44. ÉQUIPE

Ne pas surconstruire maintenant. Si Divine Motion possède seulement quelques personnes à présenter, le contenu peut être rattaché à À propos. Un modèle Team séparé ne sera créé que si le besoin devient réel.

## 45. STACK TECHNIQUE ENVISAGÉE

Astro, TypeScript, Cloudflare Workers, Cloudflare D1, Cloudflare R2, Cloudflare Images, Cloudflare Access, Cloudflare Turnstile, Cloudflare Web Analytics, GitHub.

Elle n'est pas destinée à être changée sans raison forte. Toute proposition de changement architectural majeur doit être argumentée.

> **Confirmée** par la mise à jour du 15 septembre 2026, section 29. Voir ADR-001.

## 46. ASTRO

Le site est principalement contenu, photographie, SEO, pages éditoriales. JavaScript navigateur doit rester minimal. Utiliser l'interactivité uniquement lorsqu'elle apporte une valeur réelle.

## 47. CLOUDFLARE WORKERS

Workers peut gérer notamment : API, logique serveur, contact, CMS, R2, D1, publication. Éviter la multiplication de backends inutiles.

## 48. D1

D1 stocke : données structurées, projets, services, médias metadata, contenu, témoignages, paramètres, SEO. Pas les fichiers binaires.

## 49. R2

R2 stocke : masters de publication, médias utilisés sur le site. Staging et production doivent disposer de buckets séparés.

## 50. CLOUDFLARE ACCESS

Admin (`admin.divinemotion.ca`) protégé par Cloudflare Access. Le simple fait de connaître l'URL ne doit pas permettre d'utiliser l'admin.

> **Précisé** — vérification réelle du JWT Access côté Worker exigée explicitement. Voir ADR-008.

## 51. TURNSTILE

Utiliser Turnstile pour les formulaires nécessitant une protection anti-bot. Validation serveur obligatoire.

## 52. ANALYTICS

Cloudflare Web Analytics fait partie du MVP : pages visitées, trafic, provenance, performance. Pas de système Analytics custom dans le CMS.

## 53. EMAIL TRANSACTIONNEL

Les emails critiques doivent passer par une solution transactionnelle fiable (Postmark ou Resend à évaluer). Le système doit prévoir SPF, DKIM, DMARC, domaine d'envoi, adresse de réception, gestion erreurs. Ne pas utiliser une solution expérimentale pour les leads commerciaux critiques.

## 54. SEO

MVP : title, description, canonical, Open Graph, Twitter/social meta lorsque pertinent, sitemap, robots, hreflang, URLs propres, Schema.org pertinent, alt, SEO images, performance.

## 55. SEO LOCAL

Inclure : optimisation locale, LocalBusiness lorsque pertinent, Organization, Service, cohérence avec Google Business Profile.

## 56. PERFORMANCE

Objectifs : JavaScript minimal, responsive images, lazy loading, cache, fonts optimisées, stabilité layout, Core Web Vitals. Le site doit être rapide réellement, pas uniquement dans Lighthouse.

## 57. SÉCURITÉ

Inclure : Cloudflare Access, validation backend, requêtes SQL paramétrées, validation upload, contrôle MIME, limites poids/dimensions, secrets via environnement, aucune clé dans Git, protection CSRF lorsque nécessaire, rate limiting lorsque nécessaire, Turnstile, logs, principe du moindre privilège.

## 58. OBSERVABILITÉ

Avant production : Worker logs, erreurs, traces lorsque pertinent, monitoring disponibilité, alertes erreurs serveur, surveillance formulaire contact. Nous devons pouvoir détecter une panne avant qu'un client nous contacte pour dire que le formulaire ne marche plus.

## 59. ARCHITECTURE DES ENVIRONNEMENTS

**LOCAL** — Développement.
**STAGING** — Vraie infrastructure test (`staging.divinemotion.ca`).
**PRODUCTION** — `divinemotion.ca`, `admin.divinemotion.ca`.

## 60. ISOLATION DES DONNÉES

Obligatoire : D1 staging != D1 production, R2 staging != R2 production. Les tests ne doivent jamais manipuler les médias ou données réelles de production.

## 61. GITHUB

GitHub est LA SOURCE DE VÉRITÉ TECHNIQUE — pas ChatGPT, pas Claude, pas ordinateur local, pas Cloudflare Dashboard. Le code source et la documentation vivent dans Git.

## 62. BRANCHING

```text
main ↑ staging ↑ feature/*
```

Exemples : `feature/homepage`, `feature/media-library`, `feature/visual-editor`, `feature/contact-form`.

## 63. MAIN

`main` correspond au code destiné à la production. Pas de développement direct.

## 64. STAGING

Les features validées convergent vers staging. Staging reçoit les tests réels.

## 65. MIGRATIONS D1

Aucune modification manuelle incontrôlée du schéma. Migrations versionnées : `001_initial.sql`, `002_projects.sql`, `003_media.sql`, `004_testimonials.sql`, ...

## 66. DOCUMENTATION DU REPOSITORY

```text
/docs
  MASTER_BRIEF.md
  ROADMAP.md
  PRODUCT_REQUIREMENTS.md
  UX_FLOWS.md
  INFORMATION_ARCHITECTURE.md
  DESIGN_SYSTEM.md
  TECHNICAL_ARCHITECTURE.md
  DATA_MODEL.md
  MEDIA_ARCHITECTURE.md
  VISUAL_EDITOR_SPEC.md
  CMS_SPEC.md
  SECURITY_PRIVACY.md
  SEO.md
  ACCESSIBILITY.md
  TEST_PLAN.md
  DEPLOYMENT.md
  BACKUP_RECOVERY.md
  CHANGELOG.md
/decisions
```

## 67. ARCHITECTURE DECISION RECORDS — ADR

```text
ADR-001-tech-stack.md
ADR-002-visual-editor.md
ADR-003-media-processing.md
ADR-004-localization.md
```

Structure : Décision, Contexte, Pourquoi, Alternatives, Conséquences.

> **Étendu** — la liste actuelle des ADR est dans `docs/decisions/` (10 ADR au 15 septembre 2026, voir README.md).

## 68. BUT DES ADR

Éviter qu'une IA ou un développeur remette inconsciemment en cause une décision prise six mois auparavant. Exemple : si Cloudflare Images a été retenu pour éviter Sharp custom, ne pas réintroduire Sharp sans proposition d'architecture explicite.

## 69. GOUVERNANCE

Le projet est dirigé selon le modèle suivant.

## 70. BORIS — FONDATEUR / PRODUCT OWNER

Responsabilités : vision Divine Motion, identité, arbitrage business, contenu, photos, priorités, validation finale. Boris n'est pas censé devenir administrateur technique de la stack.

## 71. CHATGPT — PRODUCT / UX / ARCHITECTURE / COORDINATION / QA

Responsabilités : direction produit, architecture fonctionnelle, UX, design direction, architecture technique, spécifications, analyse des risques, gouvernance, review, QA, coordination avec Claude Code.

## 72. CLAUDE CODE — IMPLEMENTATION LEAD

Responsabilités : développement, architecture de code, implémentation, tests, migrations, documentation technique, performance, correction, refactoring contrôlé, rapports d'implémentation.

## 73. CLAUDE PEUT CHALLENGER

Claude Code n'est pas uniquement un exécutant. Si une décision semble dangereuse, inutilement complexe, incohérente, coûteuse, dépassée, Claude doit le signaler. Mais : CLAUDE NE MODIFIE PAS UNILATÉRALEMENT UNE DÉCISION PRODUIT STRUCTURANTE. Il propose. La décision est examinée. Puis validée.

## 74. CHANGEMENTS NÉCESSITANT VALIDATION

Notamment : framework, base de données, stockage médias, auth, routing, architecture du visual editor, modèle de publication, grandes dépendances, changements de design system, suppression de fonctionnalités MVP, ajout de fonctionnalités hors scope.

## 75. WORKFLOW OFFICIEL

```text
ChatGPT → Specification → Boris validation → Claude Code → Implementation + tests
→ Implementation Report → ChatGPT Review → Corrections groupées → Staging
→ Validation → Merge / Release
```

## 76. IMPLEMENTATION BRIEF

Claude ne doit pas recevoir simplement « Construis la médiathèque ». Il recevra : OBJECTIF, SCOPE, HORS SCOPE, UX, DATA, API, SECURITY, EDGE CASES, RESPONSIVE, ACCEPTANCE CRITERIA, TESTS, FILES/SYSTEMS NOT TO MODIFY.

## 77. RAPPORT OBLIGATOIRE DE CLAUDE

Après chaque lot : Résumé, Fichiers créés, Fichiers modifiés, Migrations, Dépendances ajoutées, Tests exécutés, Résultats, Écarts par rapport à la spec, Problèmes connus, Risques, Points nécessitant validation.

## 78. PAS DE MODIFICATION SILENCIEUSE

Si Claude découvre qu'une spécification n'est pas viable : ne pas improviser une architecture différente puis seulement la mentionner après. Stopper la partie concernée. Documenter. Proposer.

## 79. BUG ≠ REFACTOR GLOBAL

```text
Reproduction → Cause → Correctif minimal → Test de régression
```

Ne pas transformer chaque correction en réécriture.

## 80. GESTION PAR LOTS

Préférer : Lot responsive 01 → Test → Validation → Release, plutôt que bug/deploy/bug/deploy en boucle.

## 81. FREEZES

Architecture Freeze (stack stable), Design Freeze (système visuel stable), Data Model Freeze (modèle principal stable). Les modifications restent possibles mais deviennent explicites et documentées.

## 82. PHASES DU PROJET

- **PHASE 0 — GOUVERNANCE** (rôles, workflow, Git, documentation, ADR, environnements, règles) — TERMINÉE
- **PHASE 1 — STRATÉGIE PRODUIT & UX** — FINALISÉE le 15 septembre 2026 (voir mise à jour en tête de document)
- **PHASE 2 — DESIGN SYSTEM** — direction validée (Dark Editorial), détails dans `docs/DESIGN_SYSTEM.md`
- **PHASE 3 — SITE PUBLIC** (frontend avec données mockées ; Accueil, Travail, Services, À propos, Contact, Confidentialité ; valider l'expérience publique avant de construire tout le CMS) — PROCHAINE ÉTAPE
- **PHASE 4 — ARCHITECTURE DATA** (D1, migrations, R2, Cloudflare Images, modèles dont `work_items`, localisation, workflow médias, sauvegarde, suppression)
- **PHASE 5 — CMS** (Dashboard, Contenu, Travail, Services, Médias, SEO, Paramètres, Visual Editor, draft/preview/publish)
- **PHASE 6 — CONTENU RÉEL** (vraies photos, sélection Travail réelle, vraies descriptions, témoignages, traductions, alt, SEO)
- **PHASE 7 — QA** (UX, responsive, navigateurs, uploads, sécurité, performance, accessibilité, SEO, publication, bilinguisme, médias, contact)
- **PHASE 8 — STAGING FINAL** (simulation complète d'exploitation)
- **PHASE 9 — PRODUCTION** (migration finale, DNS, domaines, email, Access, analytics, monitoring, backups, vérifications)
- **PHASE 10 — MAINTENANCE** (bugs, dépendances, sécurité, logs, backups, restauration, SEO, performance, analytics, contenu)

## 83. STRATÉGIE DE TESTS

Unit (logique isolée), Integration (D1/R2/API), E2E (parcours critiques), Manual QA (visuel/responsive/UX). Voir `docs/TEST_PLAN.md` pour le détail actualisé.

## 84. MÉDIAS À TESTER

Petit JPEG, PNG, haute résolution (~24 Mpx), upload multiple, fichier invalide, fichier trop lourd, erreurs réseau, retry.

## 85. PERSISTANCE

```text
Upload média → Créer contenu → Reload → Logout → Login → Vérifier
```

## 86. VISUAL EDITOR

Tester : texte, image, bouton, FR, EN, draft, preview, publication, desktop, mobile, tablette.

## 87. CRITÈRE CLÉ VISUAL EDITOR

Une personne non technique doit pouvoir ouvrir l'admin, ouvrir « Modifier le site », naviguer, remplacer une photo, modifier un texte, prévisualiser, publier — sans demander l'aide d'un développeur.

## 88. MAIS

Cette même personne ne doit pas pouvoir accidentellement casser : grid, CSS, fonts, responsive, structure, composants.

## 89. DASHBOARD

Volontairement simple : projets publiés, brouillons, derniers médias, dernières modifications, raccourci Modifier le site, Nouveau projet. Pas de graphiques décoratifs.

## 90. ADMIN MOBILE

Utilisable depuis téléphone pour les actions légères (remplacer photo, corriger texte, publier, gérer quelques médias). Les opérations lourdes peuvent rester desktop-first.

## 91. FONCTIONNALITÉS HORS MVP

Ne pas développer maintenant : page builder, drag-and-drop complet (au sens page builder), éditeur CSS, CRM complet, espace client, paiement, facturation, contrats, calendrier disponibilité, réservation en ligne, galeries clients, favoris clients, application mobile, blog avancé, DAM complexe, retouche photo, IA générative CMS obligatoire, personnalisation utilisateur, analytics custom, automatisation réseaux sociaux, permissions utilisateurs complexes, pages projet individuelles, Stories/Histoires avancées.

## 92. POSSIBLE FUTUR

À évaluer après lancement — Client (galeries privées, téléchargement, favoris) ; Commercial (devis, contrats, paiements, calendrier) ; Contenu (Stories/Histoires narratives pour mariages/événements exceptionnels, SEO éditorial) ; IA (alt text, SEO suggestions, recherche médias, assistance rédactionnelle) seulement si utile.

## 93. RÈGLE CONCERNANT L'IA

Divine Motion doit rester utilisable si un fournisseur IA disparaît. Aucune fonction centrale ne doit dépendre d'une IA externe sans raison forte.

## 94. PHILOSOPHIE MAINTENANCE

Après lancement, la question principale ne sera pas « Quelle fonctionnalité ajouter ? » mais « Qu'est-ce qui améliore réellement Divine Motion ? »

## 95. DÉFINITION DU SUCCÈS — VISITEUR

Le visiteur comprend rapidement : Divine Motion est professionnel, fait photo/vidéo, voici son style, voici son travail, voici comment le contacter.

## 96. DÉFINITION DU SUCCÈS — ADMIN

Divine Motion peut maintenir son site sans développeur pour textes, images, sélection Travail, services, publications, SEO simple.

## 97. DÉFINITION DU SUCCÈS — TECHNIQUE

Un développeur senior externe doit pouvoir cloner, installer, lancer, comprendre, migrer, tester, déployer — sans devoir lire les conversations ChatGPT/Claude historiques.

## 98. DÉFINITION DU SUCCÈS — LONG TERME

Dans trois ans : « L'architecture initiale était suffisamment simple et disciplinée pour évoluer sans reconstruction complète. »

## 99. PRINCIPE MAÎTRE

Divine Motion V2 n'est pas un CMS permettant de fabriquer n'importe quel site. Divine Motion V2 est un excellent site spécifiquement conçu pour Divine Motion, accompagné d'outils extrêmement simples permettant à Divine Motion de gérer son contenu.

## 100. ÉDITEUR VISUEL — PHRASE DE RÉFÉRENCE

ÉDITEUR VISUEL : OUI. PAGE BUILDER : NON.

## 101. COMPLEXITÉ

Toute complexité doit répondre à au moins l'un de ces objectifs : améliorer l'expérience client, augmenter la conversion, améliorer la qualité visuelle, simplifier l'administration, améliorer sécurité/fiabilité, faciliter maintenance. Sinon : NE PAS L'AJOUTER.

## 102. RESPONSABILITÉ DE CLAUDE CODE

Claude Code doit protéger activement cette simplicité. Tu dois être capable de dire : « Techniquement possible, mais inutilement complexe. » Le meilleur code est parfois le code qui n'est jamais ajouté.

## 103. CE QUE NOUS ATTENDONS DE CLAUDE AVANT LE PREMIER COMMIT

Après lecture de ce document, NE CODE PAS. Retourne d'abord un rapport intitulé « DIVINE MOTION V2 — CLAUDE CODE ONBOARDING REVIEW » avec les sections : Compréhension du projet ; Principes non négociables ; Architecture technique ; Visual Editor ; Données ; Médias ; Bilinguisme ; Sécurité et confidentialité ; Git/CI/environnements ; Tests ; Long terme ; Décisions recommandées avant développement ; Questions bloquantes ; Recommandation finale.

## 104. IMPORTANT — PAS DE CODE À CE STADE

Après l'Onboarding Review : nous examinerons tes recommandations. Nous finaliserons la PRODUCT & UX SPECIFICATION. Puis DESIGN SYSTEM. Puis seulement IMPLEMENTATION.

## 105. RÈGLE FINALE

La réussite de Divine Motion V2 ne sera pas mesurée par le nombre de fonctionnalités, la quantité de code, la sophistication du CMS, le nombre de composants. Elle sera mesurée par : QUALITÉ, SIMPLICITÉ, FIABILITÉ, IMAGE DE MARQUE, PERFORMANCE, CONVERSION, MAINTENABILITÉ.

---

## MANIFESTE DIVINE MOTION V2

Simple sans être simpliste.
Premium sans être prétentieux.
Éditorial sans être compliqué.
Photographique sans être lourd.
Moderne sans dépendre d'une mode.
Administrable sans devenir un page builder.
Puissant sans devenir fragile.
Flexible sans devenir générique.
Professionnel sans devenir froid.

Et surtout :

Le contenu appartient à Divine Motion.
Le design appartient au Design System.
Le code doit rester compréhensible.
La complexité doit toujours être justifiée.
