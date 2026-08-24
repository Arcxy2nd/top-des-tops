# NEXT_SESSION — top-des-tops

## État courant
- Version livrée : **v3.20.0** (2026-08-24) — audit passe 7 (❓ Guide, dernière du registre), poussé sur `main`, déploiement auto vers les 2 cibles.
- 3 briques partagées dans `Index.html` : `anchorFloating()` (éléments flottants ancrés), `openModal()`/`closeModal()` sur pile `_modalStack` (7 conteneurs), `onModalKeydown` (Échap/Ctrl+Entrée/piège de Tab, un seul handler). `setupResizable()` (Guide + Barème) gère maintenant souris/tactile/clavier avec plafond dynamique lié au viewport.
- Suite de tests : 272 cas verts (`npm run verify`).
- Prochaine tâche prioritaire : TBD — le registre d'audit onglet par onglet (`docs/superpowers/plans/2026-08-11-audit-onglet-par-onglet.md`) est **clos** (7/7 cibles livrées). Aucun chantier connu en attente.
- Init recommandé : light (ce fichier + `context.md` §5/§7 si la session touche à l'UI).

## Dernière session
- Audit onglet par onglet, passe 7 (❓ Guide) — dernière cible du registre, protocole complet (cartographie → sonde → conseil à 5 en parallèle → vérification adversariale → correction).
- Contenu du Guide périmé corrigé : section Outils (2 outils sur 5 manquaient — Doublons, Mentions — plus 3 actions de la carte Santé), section Dashboard (exports "Tout exporter"/"Ce trimestre" absents), section Paramètres ("Six sous-onglets" → 9 réels, Identité/Changelog ajoutés), astuce Tchat (rythme de sondage inversé), description Rapport de santé (confusion "entrées en double" vs "noms en double").
- Bugs corrigés : `--accent-rgb` jamais déclarée (teinte de survol figée en thème clair), cible tactile mobile < 44px sur le menu Guide, groupes du menu masqués en mobile, resizer du menu sans plafond lié au viewport (pouvait écraser le contenu), sans support tactile/clavier, et `localStorage` non protégé dans `setupResizable()`.
- Ajouté : recherche dans le menu du Guide, renvois internes cliquables, comportement ARIA "onglets" (`role="tablist"/"tab"/"tabpanel"`).
- Nouveaux tests `tests/guide-audit.test.js` (16 cas) avec 2 garde-fous d'exhaustivité automatique (comparent le Guide aux vraies cartes/sous-onglets de l'app).
- Plan de passe : `docs/superpowers/plans/2026-08-11-audit-guide.md`. Registre mis à jour (7/7, clos).

## Écarts
- Aucun écart connu sur la passe Guide — tous les défauts confirmés et améliorations retenues ont été traités.
- Écarté volontairement (nécessiterait un accord explicite sur une refonte visuelle) : menu déroulant mobile à la place des boutons empilés, réalignement du style sur les pastilles `.settings-nav-btn`, indicateur visuel du resizer, bouton de réinitialisation de largeur.

## Rappels actifs + Backlog
- **Piège shell** : les heredocs Git Bash sur cette machine mangent un niveau d'antislash — `\\(` devient `\(`. Ne jamais écrire de `new RegExp("...")` via heredoc ; passer par l'outil d'édition.
- **Cross-realm dans les tests `vm`** : `assert.deepStrictEqual` échoue sur des tableaux construits dans un sandbox `vm` différent du contexte Node, même quand le contenu est identique — comparer via `JSON.stringify(...)` des deux côtés dès qu'un test extrait une fonction d'`Index.html` qui retourne des tableaux/objets imbriqués.
- Garde-fou en place : `tests/papercuts.test.js` échoue si un futur élément flottant recâble `scroll`/`resize` à la main au lieu de passer par `anchorFloating`. Nouveau garde-fou `tests/guide-audit.test.js` : échoue si un futur outil (Paramètres → 🔧 Outils) ou sous-onglet (Paramètres) est ajouté sans être documenté dans le Guide.
- Backlog : **vide**. Le registre d'audit onglet par onglet est clos (7/7). Aucun chantier connu en attente — prochaine session à définir selon les besoins du moment.
