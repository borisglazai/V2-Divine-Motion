# Accessibility — Divine Motion V2

Objectif : WCAG 2.2 AA.

## Contraste (vérifié sur la palette Dark Editorial de Phase 2)

- Texte principal `#F3F0E9` sur fond `#101010` : ≈ 17.3:1 — conforme.
- Texte secondaire `#A29D94` sur fond `#101010` : ≈ 7.1:1 — conforme.
- **Texte discret `#77736D` sur fond `#101010` : ≈ 4.04:1 — non conforme AA pour le texte normal (seuil 4,5:1).** Conforme uniquement pour le grand texte (≥18px, ou ≥14px en gras) ou les éléments d'interface non textuels (seuil 3:1). Ne pas utiliser `Texte discret` pour des légendes ou mentions légales en petite taille sans l'éclaircir.
- Accent chaud `#C2AE8E` sur fond `#101010` : ≈ 8.8:1 — conforme, y compris pour un usage textuel si nécessaire.

## Autres critères à couvrir

Clavier (navigation complète sans souris, y compris l'éditeur visuel), focus visible, alt text FR/EN sur toutes les images (obligatoire, pas de valeur par défaut vide), labels de formulaire explicites, messages d'erreur clairs et associés au champ, tailles de cibles tactiles (≥24×24px), structure sémantique (landmarks, hiérarchie de titres cohérente même avec une direction très visuelle/peu textuelle).

## Cas particulier : direction « très peu textuelle »

Le parti pris éditorial (peu de texte, grandes images) ne dispense pas des exigences d'accessibilité : chaque image significative garde un alt text réel (pas décoratif par défaut), et les CTA courts restent des libellés explicites (pas des icônes seules sans alternative textuelle).
