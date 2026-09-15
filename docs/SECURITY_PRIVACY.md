# Security & Privacy — Divine Motion V2

## Admin

`admin.divinemotion.ca` protégé par Cloudflare Access. Vérification réelle de la signature du JWT Access côté Worker — aucune confiance dans un simple en-tête HTTP non vérifié (voir `docs/decisions/ADR-008-security-access-jwt.md`). C'est le point exact où l'ancien projet portait un risque résiduel documenté et non résolu (`docs/ONBOARDING_REVIEW.md`, section 8).

## Formulaire de contact

Champs : nom, courriel, téléphone (facultatif), type de prestation, date (facultative), lieu, message. Cloudflare Turnstile + validation serveur. Mention de confidentialité affichée au formulaire, avec lien vers `/confidentialite` (`/en/privacy`). Pas de CRM custom au MVP ; principe de minimisation maintenu (Master Brief section 20) — journalisation minimale sans PII recommandée pour la supervision (voir `docs/ONBOARDING_REVIEW.md` section 8).

## Confidentialité

Pages `/confidentialite` et `/en/privacy` requises au MVP. Prévoir : politique de confidentialité publique, collecte minimale, information claire au formulaire, conservation limitée, procédure de suppression.
**EFVP/PFIA (Loi 25, Québec)** à planifier comme tâche datée avant la Phase 9 (production) — Cloudflare et les fournisseurs d'e-mail transactionnel envisagés (Postmark/Resend) sont hors Québec.

## Droits de publication (personnes identifiables)

Voir le point ouvert dans `docs/CMS_SPEC.md` concernant `work_items` : recommandation d'un garde-fou de publication équivalent à celui du Master Brief original, à confirmer en Phase 4.

## Général

SQL paramétré, validation MIME des uploads, secrets hors Git, principe du moindre privilège, logs, rate limiting lorsque nécessaire — inchangé par rapport au Master Brief original (sections 57-58).
