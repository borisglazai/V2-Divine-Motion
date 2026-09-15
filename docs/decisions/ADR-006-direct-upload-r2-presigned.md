# ADR-006 — Upload direct vers R2 par URL présignée

**Décision.** Les médias volumineux sont uploadés directement vers R2 via une URL présignée. Le Worker ne proxyfie jamais le binaire complet d'un fichier.

**Contexte.** Fichiers testés jusqu'à ~24 Mpx (voir `docs/TEST_PLAN.md`). Un Cloudflare Worker a des limites de taille de requête/CPU qui rendent un proxy fragile à ce volume ; l'ancien projet semble avoir proxyfié les uploads et pré-généré plusieurs tailles côté serveur (voir ADR-005).

**Pourquoi.** Fiabilité de l'upload ; pas de limite artificielle imposée par le Worker sur la taille des fichiers acceptés.

**Alternatives.** Proxy binaire via le Worker (écarté — fragile aux volumes visés).

**Conséquences.** Le Worker génère l'URL présignée et n'enregistre les métadonnées (D1) qu'après confirmation de l'upload. Nécessite une étape de validation post-upload (MIME réel, dimensions) côté serveur avant d'exposer le média dans la médiathèque.
