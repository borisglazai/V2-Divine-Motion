# ADR-015 — Aucun stockage D1 des soumissions du formulaire de contact au MVP

**Décision.** Le schéma D1 ne contient aucune table liée au formulaire de contact. Le flux reste : validation → Turnstile → envoi d'un email transactionnel → observabilité via les logs/alertes du Worker (pas via D1). Aucune soumission, aucun contenu de message, aucune adresse IP ni hash d'IP n'est stocké en base au MVP.

**Contexte.** `docs/DATA_ARCHITECTURE.md` (Brief 009) proposait une table technique minimale, `contact_submission_log`, explicitement dépourvue de PII (pas de nom/courriel/téléphone/message), destinée à l'anti-abus et à l'observabilité (statut d'envoi email, validation Turnstile, IP salée-hashée). La Review 009A retire cette table du schéma MVP : même minimisée, elle reste une persistance de métadonnées de visiteur que le produit n'a pas justifiée comme nécessaire au MVP.

**Pourquoi.** Conforme au principe de minimisation du Master Brief (section 20) poussé jusqu'à son terme : si une donnée n'est pas indispensable, elle ne doit pas être stockée « juste au cas où », même sous forme dégradée/hashée. L'observabilité réelle (l'email est-il parti ? y a-t-il un pic anormal de soumissions ?) est un besoin d'exploitation, pas un besoin de contenu — elle appartient aux outils d'observabilité du Worker (logs, alertes), pas à la base de données de contenu de Divine Motion.

**Alternatives.** `contact_submission_log` minimal et non identifiant, tel que proposé initialement (écarté par cette révision — voir Décision). Stockage complet des soumissions façon CRM (jamais envisagé — contredit directement Master Brief section 20 et `docs/SECURITY_PRIVACY.md`).

**Conséquences.** Si l'email transactionnel échoue et que l'alerting Worker ne le détecte pas, le message du visiteur est réellement et définitivement perdu — aucun filet de sécurité en base. C'est le risque que le monitoring d'exploitation (Master Brief section 58) doit couvrir explicitement avant la Phase 9 (production), pas quelque chose que ce schéma compense. `docs/drafts/001_initial.sql` ne contient plus `contact_submission_log`.
