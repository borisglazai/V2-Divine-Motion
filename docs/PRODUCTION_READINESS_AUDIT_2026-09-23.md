# Production Readiness Audit — 23 septembre 2026

**Branche auditée :** `validation/staging-cloudflare`  
**Commit de départ confirmé :** `190bac503d0dc863caf5c056a65bf083d8b027b3`  
**Staging contrôlé :** `https://v2-divine-motion.borisglazaicanada.workers.dev`  
**Production :** non touchée.

Ce document décrit l'état réellement observé dans le dépôt et sur le Worker staging. Il ne remplace pas les rapports de validation précédents; il consolide ce qui reste avant une décision de mise en production.

## 1. Validé et conservé

- Contact réel : Turnstile, Resend, rate limiting et réception email validés en staging.
- Déploiement staging : Cloudflare Workers Builds / Git integration, D1 `0001` à `0006`, rollback documenté.
- Auth admin : application Access dédiée à `/admin*`, JWT vérifié côté Worker.
- Hardening CSP corrigé au commit `190bac5` : hashes dynamiques des scripts inline, aucun `unsafe-eval`, pas de `unsafe-inline` global pour `script-src`.
- CMS réels : Travail, Médias, Services, Témoignages et Visual Editor des cinq pages principales.
- Les 12 routes publiques FR/EN répondent et rendent un document complet sur le staging contrôlé le 23 septembre 2026.
- Baseline locale auditée : lint et typecheck verts; 364 tests non navigateur verts (auth 24, DAL 42, migration 5, Travail 40, Services 23, Témoignages 22, Site Editor 26, Storage 29, Médias 18, Public 102, Contact 33).
- Audit npm des dépendances de production : 0 vulnérabilité connue.

## 2. Blockers avant production

### 2.1 Contenu staging non publiable en l'état

Contenu réellement rendu le 23 septembre 2026 :

- Accueil FR : `Des imagfgtes qui resftent en mouvement.`
- Contact FR : `Parlons de votre prffffffojet.`
- Accueil EN : `Images that stdday in motion.`
- Accueil : contenu de démonstration encore publié (`99`, service très sommaire, témoignage de test).
- À propos / Accueil : plusieurs visuels de secours et textes alternatifs `photo à venir` restent possibles tant que les médias éditoriaux correspondants ne sont pas configurés.

Ces corrections sont des mutations de contenu D1 staging, pas des corrections de code. Elles doivent être faites via le Visual Editor/CMS puis relues en FR et EN avant toute promotion.

### 2.2 Coordonnées et mentions légales non finales

- Le footer et le contenu de secours Contact utilisent encore `https://instagram.com` au lieu du compte Divine Motion.
- `bonjour@divinemotion.ca` est encore documenté comme valeur plausible/placeholder, pas comme adresse confirmée.
- Confidentialité FR et EN affiche explicitement une date « à confirmer avant mise en production ».
- L'EFVP/PFIA Loi 25 est encore marquée « à planifier » dans `docs/SECURITY_PRIVACY.md`.

Les vraies coordonnées et la validation légale sont des entrées propriétaire requises; ne pas les inventer.

### 2.3 SEO MVP — corrigé dans le lot du 24 septembre 2026

Le lot SEO relie désormais `page_seo` aux pages publiques et fournit :

- `/admin/seo` fonctionnel avec validation FR/EN, image sociale, canonical et noindex;
- titres/descriptions D1 avec repli sûr sur les contenus existants;
- canonical, hreflang, Open Graph et Twitter Cards;
- sitemap multilingue et `robots.txt`;
- données structurées Schema.org `ProfessionalService`;
- autorisation publique contrôlée des médias utilisés uniquement comme image Open Graph.

La validation finale de ce lot reste soumise au build Cloudflare staging et au contrôle navigateur après déploiement.

### 2.4 Paramètres et contenu CMS promis mais inachevés

- `/admin/settings` est encore « Module en préparation », alors que `site_settings` et son DAL existent.
- `/admin/content` est encore « Module en préparation ». Le Visual Editor couvre déjà le contenu principal; cette entrée doit soit devenir un point d'accès clair aux éditeurs structurés, soit être retirée de la navigation pour ne pas livrer un écran mort.
- Les coordonnées publiques du footer ne lisent pas `site_settings`, ce qui maintient deux sources de vérité.

### 2.5 QA finale non terminée

- Le test axe-core WCAG 2.2 A/AA a été ajouté, mais son exécution locale est bloquée dans ce conteneur par l'échec système du serveur Astro/Cloudflare (`Dev server process exited before becoming ready`). Il doit passer dans GitHub CI.
- Une QA manuelle clavier, lecteur d'écran ciblé, menu mobile, formulaires en erreur, responsive et pertinence des alt reste nécessaire.
- Le build local est bloqué par `uv_interface_addresses` dans le plugin Cloudflare de ce conteneur; le build Cloudflare réel après push devient la preuve autoritative.

## 3. Corrections nécessaires déjà engagées

- CI déclenchée sur `validation/staging-cloudflare` (elle ne surveillait auparavant que `main` et `staging`).
- Node CI et moteur du projet alignés sur Astro 7 : Node `>=22.12.0`.
- `@types/node` ajouté pour aligner `wrangler types` avec `nodejs_compat` et supprimer son avertissement d'installation manquante.
- Garde-fou axe-core ajouté aux 12 routes publiques FR/EN.
- Plan de tests mis à jour pour refléter la couverture réelle.

## 4. Hardening non bloquant

- Nettoyer les 7 indications TypeScript de code/imports inutilisés.
- Mettre à jour la documentation historique devenue contradictoire : plusieurs passages de `DEPLOYMENT.md` et `STAGING_VALIDATION.md` disent encore que R2/Access n'ont pas été validés, alors que les rapports 014S et Visual Editor les déclarent validés.
- Valider le réglage Cloudflare « Always Use HTTPS » / HSTS dans le dashboard.
- Tester une restauration D1 et documenter une stratégie de récupération R2; `BACKUP_RECOVERY.md` ne couvre aujourd'hui que D1 de façon conceptuelle.
- Confirmer l'activation réelle de Cloudflare Web Analytics; aucune intégration n'est visible dans le dépôt.
- Vérifier performance/Lighthouse sur mobile avec les médias réels et décider explicitement du traitement/optimisation d'images avant lancement.

## 5. Fonctionnalités non terminées, non nécessairement bloquantes pour le MVP

- Glisser-déposer de la sélection Travail demandé dans les Product Requirements : le produit livre actuellement Précédent/Suivant, décision assumée en Phase 3.
- Trois fichiers admin non Visual Editor conservent leurs styles locaux plutôt que le design system partagé.
- Le swap de deux positions Travail reste une opération D1 en deux écritures non atomiques.
- Les types de blocs `centered` et `offset` sont conservés mais non exercés par les trois layouts actifs.

## 6. Ordre d'exécution optimisé

1. **Fiabiliser le pipeline** : livrer le correctif CI/Node + axe; exiger CI verte et build Cloudflare staging réussi.
2. **Fermer le SEO MVP** : sitemap/robots/meta sociaux/Schema, brancher `page_seo`, construire `/admin/seo`.
3. **Fermer les paramètres** : construire `/admin/settings`, brancher footer/contact aux données réelles, transformer `/admin/content` en hub utile ou retirer son écran mort.
4. **Nettoyer le contenu staging** : fautes FR/EN, vrais textes, vrais médias, vrais témoignages, alt, coordonnées. Cette étape nécessite les valeurs métier confirmées, jamais inventées.
5. **Conformité** : finaliser la politique de confidentialité et l'EFVP/PFIA; confirmer Web Analytics et la durée de conservation email.
6. **QA complète** : CI entière, axe, navigateur desktop/mobile, clavier, performance, console, headers, parcours Contact, CMS et persistance.
7. **Opérations** : test de rollback code, test de restauration D1, stratégie R2, HSTS/HTTPS, observability et alerting.
8. **Go/no-go production** : produire une checklist signée. S'arrêter avant toute ressource, migration, DNS, secret ou déploiement production sans autorisation explicite.

## 7. Décisions / données requises de Boris avant clôture

- URL Instagram officielle.
- Adresse email publique officielle et confirmation de son fonctionnement.
- Texte/date finale de Confidentialité et responsable de la protection des renseignements personnels.
- Sélection finale des médias et témoignages autorisés à publier.
- Validation de l'identité visuelle des trois GIF de logo fournis; ils ont été inspectés mais ne sont pas intégrés automatiquement sans choix du rôle exact (logo principal, animation d'intro, favicon ou autre).

Ces entrées ne bloquent pas le développement technique des modules SEO/Paramètres, mais bloquent une déclaration « production-ready » honnête.
