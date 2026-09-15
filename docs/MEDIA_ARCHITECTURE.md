# Media Architecture — Divine Motion V2

## Principe

Le site n'est pas l'archive maître des fichiers RAW.

```text
RAW / archives Divine Motion → export master web → R2 → Cloudflare Images → transformations → CDN → site public
```

## Upload

Upload haute résolution (~24 Mpx testé) via un mécanisme d'upload direct sécurisé vers R2 (URL présignée). Le Worker ne doit pas proxyfier inutilement les gros fichiers (voir `docs/decisions/ADR-006-direct-upload-r2-presigned.md` et `docs/TECHNICAL_ARCHITECTURE.md`).

## Métadonnées (D1)

Par média : alt FR/EN, point focal (`focal_x`, `focal_y`), dimensions, poids, date, catégorie, utilisation (référencé par `work_items`, `services`, `testimonials`, contenu de page), `processing_status` (pending/uploaded/ready/failed/abandoned), et autorisation de publication (`publication_rights_confirmed`, `publication_rights_note`, `publication_rights_confirmed_at`) — voir `docs/decisions/ADR-011-publication-rights-model.md` pour le modèle complet (droits au niveau média, garde-fou appliqué à chaque usage public). Schéma détaillé : `docs/DATA_ARCHITECTURE.md` et `docs/drafts/001_initial.sql`.

## Suppression

Soft delete → corbeille → période de rétention → purge physique automatique (Cron Trigger Worker dédié). Un média référencé par `work_items`, `services`, `testimonials` ou le contenu typé des pages est protégé contre la suppression — ce calcul est fiable car le contenu des pages est structuré et typé (pas un blob JSON libre, voir `docs/decisions/ADR-004-structured-typed-content.md`), donc les références à un `media_id` sont toujours des colonnes/relations explicites, jamais du texte libre à parser.

## Sauvegarde/restauration

Stratégie à documenter et tester avant Phase 8 (staging final) : export périodique D1, politique de rétention R2, test de restauration réel (pas seulement une procédure écrite).

---

## Implémentation — Media Library + upload direct R2 (Implementation Brief 014)

### Flux réel

```text
Admin (navigateur)
  → POST /admin/media/upload/authorize   (JSON : filename, mimeType, sizeBytes)
  → Worker : requireAdminMutation, validation MIME/taille, clé R2 générée
             côté serveur, ligne D1 'pending' créée, URL PUT présignée S3
             (aws4fetch, 15 min) renvoyée
  → Navigateur PUT directement vers l'URL présignée (R2, jamais le Worker)
  → POST /admin/media/:id/upload-complete
  → Worker : HEAD réel sur R2 (présence + taille), 'pending' → 'uploaded' ;
             téléchargement + inspection réelle des octets (magic bytes,
             dimensions), 'uploaded' → 'ready' ou 'failed'
```

Le Worker ne reçoit jamais les octets du fichier lui-même — seule l'étape de vérification post-upload lit l'objet (petit trafic, admin uniquement), jamais l'upload initial.

### Modules

- `src/lib/storage/keys.ts` — génération de clé serveur (`media/{uuid}/original.{ext}`), jamais dérivée du nom de fichier client ni de l'id D1.
- `src/lib/storage/r2-presign.ts` — URL PUT présignée SigV4 via `aws4fetch` (voir ADR-017 pour le choix de la bibliothèque).
- `src/lib/storage/image-inspect.ts` — détection réelle JPEG/PNG (magic bytes) + dimensions réelles (chunk IHDR pour PNG, segment SOFx pour JPEG) — jamais une confiance dans le `Content-Type` déclaré.
- `src/lib/storage/env.ts` — seul fichier lisant le binding `R2Bucket` (`env.MEDIA`) et les secrets S3 réels.
- `src/lib/storage/media-storage.ts` — compose les trois modules ci-dessus (autoriser, head, valider) ; ne touche jamais D1.
- `src/lib/admin/media-actions.ts` — logique métier injectable (`db`, `bucket`, `credentials` en paramètres explicites, jamais importés), même convention que `work-actions.ts`.

### MIME / taille / dimensions

JPEG et PNG uniquement (`image/jpeg`, `image/png`) — pas de SVG, pas de WebP sans justification trouvée dans ce lot. Taille max 50 Mo (`MAX_MEDIA_UPLOAD_BYTES`, `src/lib/admin/media-actions.ts`) — assez pour un export JPEG/PNG même en ~24 Mpx, sans accepter n'importe quelle taille. Les dimensions ne sont jamais prises du navigateur : après upload, le Worker télécharge l'objet réel et lit ses vraies dimensions (`image-inspect.ts`).

### Cycle de vie, storage keys, `authorized_at`/`uploaded_at`

Voir `docs/decisions/ADR-017-r2-direct-upload-lifecycle.md` et `docs/DATA_ARCHITECTURE.md` "Media upload lifecycle" pour le détail complet (5 états, deux écritures D1 distinctes par `/upload-complete`, sémantique des deux timestamps, nettoyage `abandoned`).

### Aperçu admin (§37-38)

`GET /admin/media/:id/file` — route admin-only qui lit l'objet R2 via le binding natif et le renvoie avec le bon `Content-Type`. Protégée par le même middleware que toute route `/admin/**` (Cloudflare Access). Délibérément distincte du futur pipeline public (pas de transformation, pas de CDN, pas de cache) — trafic faible, usage interne uniquement.

### Médiathèque admin

`/admin/media` (liste, filtres actif/corbeille/statut/nom de fichier, upload multi-fichiers avec progression par fichier) et `/admin/media/:id` (détail : alt FR/EN, point focal X/Y 0-100, droits de publication avec case à cocher + note optionnelle, utilisation réelle via `getMediaUsage`, corbeille/restauration). Le sélecteur média existant de la CMS Travail (`src/pages/admin/work/new.astro`/`[id].astro`) n'a pas été dupliqué : il relit `listMedia().filter(ready)` à chaque chargement de page, donc un média fraîchement uploadé et passé `ready` y apparaît immédiatement sans aucun changement de code.

### Sécurité

Toute mutation (`authorize`, `upload-complete`, `save`, `delete`, `restore`) passe par `requireAdminMutation` (identité admin + Origin strict, ADR-016) — jamais de logique dupliquée par endpoint. Chaque route `:id` vérifie l'existence réelle de la ligne avant d'agir (IDOR). Aucun secret R2 (clé d'accès S3) n'est jamais exposé au navigateur ni committé dans `wrangler.toml` — voir `docs/DEPLOYMENT.md` "R2 credentials".

### CORS R2

Voir `docs/DEPLOYMENT.md` "R2 CORS" pour la politique exacte par environnement.
