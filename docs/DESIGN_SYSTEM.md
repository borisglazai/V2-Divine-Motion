# Design System — Divine Motion V2

Direction validée : **Dark Editorial**. Le site doit ressembler à une galerie photographique contemporaine, pas à un template de photographe.

## Couleurs (référence, Phase 2)

```text
Fond principal     #101010
Fond secondaire    #171717
Surface admin      #1D1D1D
Texte principal    #F3F0E9
Texte secondaire   #A29D94
Texte discret      #77736D
Accent chaud       #C2AE8E
Bordures           rgba(255,255,255,.12)
```

L'accent chaud reste discret ; les photos apportent l'essentiel de la couleur.

**Note d'accessibilité (vérifiée) :** contraste de `Texte principal` sur `Fond principal` ≈ 17.3:1 et `Texte secondaire` sur `Fond principal` ≈ 7.1:1 — largement conformes AA. `Texte discret` (#77736D) sur `Fond principal` (#101010) ≈ **4.04:1**, en dessous du seuil AA de 4,5:1 pour le texte normal (conforme seulement pour le grand texte / composants d'interface, seuil 3:1). Recommandation : réserver `Texte discret` aux grands textes, éléments décoratifs ou UI non textuelle ; ne pas l'utiliser pour du texte de lecture (légendes, mentions légales) en petite taille sans l'éclaircir légèrement. Voir `ACCESSIBILITY.md`. `Accent chaud` sur `Fond principal` ≈ 8.8:1 — conforme, y compris pour un usage textuel si nécessaire.

## Typographie

Serif = émotion (titres, accroches). Sans-serif = information (navigation, interface, corps, CMS).
Première combinaison à tester : **Instrument Serif** (display) + **Manrope** (interface). Encore challengeable en finalisation Phase 2 — la logique (serif pour l'émotion / sans-serif pour l'information) est la règle durable, pas le nom exact des polices.

## Grille

Desktop : 12 colonnes. Tablette : 8 colonnes. Mobile : 4 colonnes.
Beaucoup d'espace, peu de cartes, peu de border-radius, peu ou pas d'ombres, grandes photographies, composition éditoriale.

## Images

Grandes, naturelles, peu ou pas arrondies, pas de filtres CSS, pas d'overlays lourds, pas de dégradation artistique du travail photo. Overlay accepté uniquement si nécessaire à la lisibilité (ex. texte sur image).

## Compositions de galerie prédéfinies (Travail)

Le design system contrôle la composition — l'admin sélectionne les images et leur ordre, jamais leur position en pixels :

- image pleine largeur
- portrait centré
- duo
- paysage décalé
- grande image + petite image
- séquence éditoriale

## Animations

150-400 ms. Accepté : reveal léger, hover image subtil, translation légère, fade, transition propre.
Refusé : scroll hijacking, parallaxe excessive, animations gadgets, loaders décoratifs.
