# Backup & Recovery — Divine Motion V2

**Statut :** documentation de principe (Implementation Brief 010), pas d'automatisation. Couvre uniquement D1 pour l'instant — R2 (médias) sera traité quand l'upload sera implémenté (voir `docs/MEDIA_ARCHITECTURE.md`).

## Pourquoi

`wrangler d1 migrations apply` capture automatiquement une sauvegarde D1 avant chaque application de migration (comportement Wrangler natif, confirmé lors de l'exécution locale de ce brief : « After applying, a backup will be captured »). Ce document précise quand sauvegarder *en plus* de ce réflexe automatique, et comment restaurer conceptuellement.

## Quand sauvegarder manuellement

- **Avant toute migration en staging ou production** — au-delà de la sauvegarde automatique de `wrangler d1 migrations apply`, exporter un snapshot explicite si la migration modifie ou supprime des données existantes (pas seulement `CREATE TABLE`).
- **Avant toute opération corrective manuelle** (`wrangler d1 execute --remote` avec un `UPDATE`/`DELETE` ad hoc en réponse à un incident).
- **Périodiquement en production**, une fois le site réellement en exploitation (fréquence à définir en Phase 9 — hors scope de ce brief).

## Comment exporter (conceptuel — commande officielle Wrangler)

```bash
npx wrangler d1 export <database-name> --output=backup-YYYY-MM-DD.sql [--remote]
```

Produit un fichier SQL contenant le schéma et les données. À stocker hors du dépôt Git (jamais commité — un export peut contenir des données de contenu réelles, y compris potentiellement des métadonnées de médias liés à des personnes identifiables).

## Comment restaurer (conceptuel)

1. Provisionner ou vider la base cible.
2. `npx wrangler d1 execute <database-name> --file=backup-YYYY-MM-DD.sql [--remote]`.
3. Revalider avec la suite d'invariants (`npm run db:test`, adaptée pour cibler la base restaurée) avant de considérer la restauration réussie.

Aucune automatisation de ce flux n'existe à ce stade (Brief 010 §24 : documentation seulement, pas d'automatisation complexe requise). À construire si/quand une vraie fréquence de sauvegarde en production est définie.

## Ce qui N'est PAS couvert ici

- R2 (médias) — sa propre stratégie de sauvegarde/rétention viendra avec l'upload (voir `docs/MEDIA_ARCHITECTURE.md` "Sauvegarde/restauration", encore à documenter et tester avant la Phase 8).
- Toute automatisation (Cron de sauvegarde périodique, rotation, chiffrement au repos) — hors scope MVP tant que le volume réel de contenu n'existe pas.
