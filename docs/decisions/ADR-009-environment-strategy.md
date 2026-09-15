# ADR-009 — Stratégie d'environnements

**Décision.** Trois environnements — local, staging, production — avec D1 et R2 strictement isolés par environnement.

**Contexte.** Master Brief sections 59-60.

**Pourquoi.** Éviter que des tests ou du développement ne touchent des données ou médias réels de production, en particulier des photos de clients identifiables.

**Alternatives.** Environnement unique avec données de test mélangées (écarté, risque direct pour les données clients réelles).

**Conséquences.** Coût opérationnel réel (migrations à rejouer par environnement, secrets dupliqués) accepté comme nécessaire ; à automatiser via CI (ADR-010) pour ne pas dériver.
