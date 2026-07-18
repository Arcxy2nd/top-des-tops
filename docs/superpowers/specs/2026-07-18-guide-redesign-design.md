# Refonte de l'onglet Guide (❓)

Date : 2026-07-18
Statut : validé par l'utilisateur, prêt pour plan d'implémentation

## Contexte

L'onglet Guide (`Index.html:3059-3123`, dupliqué dans `Mobile.html`) est un accordéon texte figé depuis plusieurs itérations du produit. Il ne documente pas : le tchat flottant, le sous-onglet Outils (santé, nettoyage, joueurs inactifs, points automatiques, sommaire de navigation), le Journal d'audit, la bascule de thème, ni le système d'identité/mot de passe.

Objectif : refonte du contenu **et** du visuel, avec une identité graphique propre au Guide (distincte du style "livre des records" du Dashboard).

## Architecture

- Remplacement de l'accordéon (`.guide-section` / `.guide-body`) par une **grille de cards thématiques**.
- Clic sur une card → la grille est masquée, remplacée par une **vue détail plein cadre** (titre + contenu + bouton "← Retour" fixe en haut).
- Pas de recherche ni de filtre : la grille (~8 cards) reste scannable d'un seul coup d'œil.
- Comportement identique sur mobile : grille en **1 colonne**, même mécanique clic → détail → retour (pas de version simplifiée).

## Contenu — liste des cards

| Card | Contenu |
|---|---|
| 📊 Dashboard | inchangé (déjà à jour) |
| ✍️ Saisir un Lot | inchangé (déjà à jour) |
| ⚙️ Paramètres | existant + sous-onglet 🔧 Outils complet : rapport de santé, nettoyage (zéros/orphelins/doublons/scores aberrants), détection/fusion de lots répartis, groupes hérités, joueurs inactifs, points automatiques, sommaire de navigation |
| 📝 Notes | inchangé |
| 📜 Historique | existant + sous-onglet 🔍 Journal d'audit |
| 💬 Tchat *(nouvelle)* | bouton flottant, markdown, mentions `@joueur`/`#Top`, réponses citées, suppression de ses propres messages |
| ⚖️ Barème | inchangé (déjà couvert, bouton flottant + raccourci `?`) |
| 🎨 Thème & identité *(nouvelle)* | bascule dark/light, sélecteur d'identité en barre de nav, mots de passe joueurs 🔒 |

Le texte des cards existantes est repris tel quel (déjà validé), seules les cards Outils/Historique/Tchat/Thème sont enrichies ou créées.

## Style visuel

- Style "carnet de référence", distinct du "livre des records" du Dashboard.
- Card : icône du thème en grand (`2.2rem`) en haut à gauche, titre à droite.
- Liseré coloré à gauche de chaque card (`--accent` par défaut), au lieu d'une bordure classique.
- Hover : légère élévation (`translateY(-2px)` + ombre douce), pas d'effet flip/rotation.
- Vue détail : même liseré coloré en fil rouge visuel, contenu structuré en sous-titres + paragraphes courts, bouton retour fixe en haut de la vue.
- Respect des variables CSS du thème (`--bg`, `--card`, `--border`, `--text`, `--accent`…), testé en dark et light.

## Parité mobile

Même structure et même style que PC, grille en 1 colonne. Aucune simplification — le Guide reste un contenu de référence, peu consulté en usage intensif, donc pas besoin d'un format allégé.

## Hors scope

- Pas de recherche/filtre texte dans le Guide.
- Pas de changement du contenu des cards Dashboard / Saisir un Lot / Notes / Barème (déjà à jour).
- Pas de changement du système d'accordéon ailleurs dans l'app (uniquement l'onglet Guide).
