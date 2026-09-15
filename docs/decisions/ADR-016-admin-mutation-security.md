# ADR-016 — Sécurité des mutations admin (Origin strict, pas de token CSRF)

**Décision.** Toute mutation admin (`POST`/`PUT`/`PATCH`/`DELETE` sous `/admin/**`) passe par `requireAdminMutation()` (`src/lib/auth/mutation.ts`), qui vérifie : la méthode HTTP, l'identité admin déjà validée par `src/middleware.ts`, et une correspondance stricte entre l'en-tête `Origin` de la requête et l'origine (protocole + host) de l'URL de la requête elle-même. **Aucun token CSRF synchronizer, aucun double-submit cookie.**

**Contexte.** Brief 013 demandait d'étudier trois options : (A) `Origin` strict + POST only, (B) token CSRF synchronizer, (C) double-submit cookie — et d'expliciter le raisonnement plutôt que d'ajouter un mécanisme par réflexe.

**Pourquoi Option A suffit ici.**

1. **Aucun cookie de session applicatif.** Ce projet ne pose aucun cookie lui-même — l'unique état d'authentification est le JWT `Cf-Access-Jwt-Assertion` vérifié cryptographiquement à chaque requête (ADR-008), pas une session server-side. Un token CSRF synchronizer protège classiquement contre le vol d'un cookie de session ambient ; il n'y a pas d'équivalent ici à protéger de cette façon.
2. **`Origin` est un en-tête que le navigateur pose lui-même et qu'aucun script cross-origin ne peut falsifier** (contrairement à un champ de formulaire caché, jamais suffisant seul — Brief 013 §5 : "pas de confiance dans des champs cachés seuls"). Un navigateur moderne envoie systématiquement `Origin` sur un `POST`/`fetch` avec body, y compris same-origin — son absence est donc traitée comme suspecte plutôt qu'ignorée (`isSameOriginRequest` rejette si absent).
3. **Comparaison auto-référentielle, pas une liste de domaines à maintenir.** `isSameOriginRequest` compare `Origin` à l'URL de la requête elle-même (`new URL(request.url)`), pas à une constante `admin.divinemotion.ca` codée en dur — fonctionne identiquement en local (`localhost:PORT`), staging et production sans configuration par environnement (Brief 013 §38).
4. **Cloudflare Access reste la première barrière**, indépendante de ce mécanisme : sans JWT valide, aucune requête n'atteint même `requireAdminMutation` (le middleware la bloque avant).

**Pourquoi ne pas quand même ajouter un token CSRF « pour cocher une case ».** Un token synchronizer ajoute un état serveur (ou un cookie applicatif signé) à faire vivre, sans neutraliser une menace que la vérification `Origin` ne couvre pas déjà dans cette architecture précise — cf. Brief 013 §7 : ne pas ajouter un mécanisme qui ne protège rien de plus ici. Si un cookie de session applicatif est introduit plus tard (ex. pour une fonctionnalité future hors du modèle JWT-par-requête), cette décision doit être réexaminée.

**Alternatives.**
- **Option B (token CSRF synchronizer)** — écartée : complexité et état supplémentaires sans bénéfice net ici (pas de cookie de session à protéger).
- **Option C (double-submit cookie)** — écartée pour la même raison, avec en plus la question non triviale de qui pose ce cookie applicatif dans une architecture qui n'en a aucun aujourd'hui.

**Conséquences.**
- Chaque nouvel endpoint de mutation (Brief 013 et suivants) DOIT appeler `requireAdminMutation()` — jamais réimplémenter sa propre vérification.
- Testé explicitement (`tests/auth/mutation.test.ts`) : GET sur une route de mutation → rejet ; POST sans identité → rejet ; POST avec un `Origin` différent → rejet ; `Origin` absent → rejet ; `Origin` same-origin valide → autorisé ; le bypass DEV ne fonctionne jamais en build de production (même garantie qu'ADR-008/Brief 012).
- Si un futur brief introduit un cookie de session applicatif (hors JWT Access par requête), cette ADR doit être révisée — le raisonnement du point 1 ne tiendrait plus tel quel.
