# Passe 7 — Audit ❓ Guide

**Statut : ✅ livré en v3.20.0 (2026-08-24).** Tous les défauts confirmés et améliorations retenues ci-dessous ont été corrigés. `npm run verify` : 272/272 verts (256 avant + 16 nouveaux dans `tests/guide-audit.test.js`). Vérifié en direct sur le harness local : navigation ARIA, lien interne cliquable, recherche, thème clair (`--accent-rgb` résout bien la bonne teinte), plafond du resizer (700px de fenêtre → 420px max au lieu d'écraser le contenu), cible tactile 44px et groupes visibles en mobile, aucune erreur console.

Registre : [2026-08-11-audit-onglet-par-onglet.md](2026-08-11-audit-onglet-par-onglet.md)

## Carte

- HTML : `Index.html:4922-5131` (`#tab-guide` — sidebar `.guide-sidebar`/`.guide-nav-btn` à 13 boutons `data-section`, panneau `.guide-content-pane`/`.guide-content-section` à 13 `id="gsec-*"`).
- JS : `initGuideAccordion()` (`Index.html:16283-16311`), appelée depuis `goToTab('tab-guide')` et au chargement. Resizer via `setupResizable()` (`Index.html:16247-16281`, partagée avec le tiroir Barème).
- CSS : `Index.html:1981-2099`.
- Contenu 100% statique, aucun appel serveur, aucune donnée du Sheet affichée.
- Test existant : `tests/nav-pages.test.js` (présence de l'onglet uniquement).
- Suite : 256/256 verts avant passe.

## Défauts confirmés

1. **Contenu du Guide périmé/incomplet** (axe data-truth, vérifié en code + en direct) :
   - `#gsec-outils` (5082-5091) omet 2 des 5 vrais outils (Doublons probables, Mentions manquantes) et 3 actions de la carte Santé (Rattacher auteur notes, Réparer l'ordre, Créer un snapshot).
   - `#gsec-dashboard` (4967) omet 2 des 5 boutons d'export réels (`🗂️ Tout exporter`, `🗓️ Ce trimestre` — ce dernier livré v3.19.0, jamais documenté).
   - `#gsec-parametres` (5025-5034) affirme « Six sous-onglets », il y en a 9 (`Index.html:4452-4461`) — Identité et Changelog absents de la liste et de tout le Guide.
   - Tip Tchat (5019) inverse le rythme de sondage réel (`Index.html:7782` : 4s panneau ouvert / 20s fermé — le tip dit l'inverse pour le cas où le badge apparaît).
   - Description « Rapport de santé » (5086) parle d'entrées « en doublon » alors que `loadDataHealth` (15766-15769) détecte des noms de joueurs/Tops en double, pas des entrées dupliquées (outil séparé, non documenté avant ce correctif).
2. **`--accent-rgb` n'existe dans aucun `:root`** (`Index.html:2023,2062,2069,2070` + une occurrence hors Guide en 15575 avec un fallback différent) — le survol/encadré du Guide utilise toujours la valeur de repli codée en dur, jamais la vraie couleur d'accent du thème clair.
3. **Cible tactile mobile `.guide-nav-btn` ≈ 30px**, sous `--tap-min: 44px` déjà standardisé ailleurs (`Index.html:2097`).
4. **Resizer sans plafond lié au viewport** — `maxSize: 480` fixe (`Index.html:16292`) peut réduire `.guide-content-pane` à ~98px de large sur une fenêtre de 700px, confirmé en direct.
5. **`setupResizable()` n'encapsule pas ses accès `localStorage`** (`16249`, `16279`), contrairement à toutes les autres clés de l'app — un stockage bloqué casserait aussi le clic sur l'onglet Guide (le listener n'est jamais posé).

## Améliorations retenues

- `.guide-feature-item` sans ajustement `body.light` (fond trop sombre en thème clair, incohérent avec le reste de l'app).
- Renvois internes du Guide (« Voir la section dédiée ») en texte statique, pas cliquables, alors que le mécanisme `data-section` existe déjà.
- Aucune garde sur un `data-section` sans `gsec-*` correspondant (couplage par chaîne fragile, silencieux).
- Aucun rôle ARIA tab/tabpanel sur un widget qui se comporte comme des onglets.
- Resizer sans support tactile ni clavier (touch events et `tabindex`/flèches absents, alors que le pattern tactile existe déjà ailleurs dans le fichier).
- Pas de recherche/filtre sur 13 sections.
- Groupes de la sidebar (labels + séparateurs) totalement masqués en mobile plutôt que simplement réagencés.

## Écartés (nécessitent un accord explicite — refonte visuelle)

- Remplacer les 13 boutons mobiles par un `<select>`/menu déroulant.
- Réaligner le style des boutons Guide sur les pastilles `.settings-nav-btn`.
- Indicateur visuel permanent sur le resizer, bouton « réinitialiser la largeur ».
- Extraction d'un helper générique de bascule d'onglet (factorisation `initGuideAccordion`/`switchStatsHubPane`/`goToTab`) — refactor transverse hors périmètre d'une passe Guide seule.
- Correction rétroactive de l'entrée CHANGELOG v3.4.2 (refonte grille→sidebar non documentée à l'époque) — laissé tel quel, l'historique n'est pas réécrit.
- Constantes nommées pour la config du resizer (`180, 480, clé localStorage`) — cohérence de style, pas un défaut.
