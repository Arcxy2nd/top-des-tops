# Changelog

Toutes les modifications notables de ce projet sont documentées ici.

Format basé sur [Keep a Changelog](https://keepachangelog.com).

## [Non publié] - 2026-07-08

### Ajouté
**Humanisé** : Les mises à jour du code se déploient maintenant automatiquement dès qu'elles sont envoyées sur GitHub — plus besoin de recopier les fichiers ni de redéployer à la main, le lien court reste toujours valide. Ça marche aussi pour les copies du même script (groupes différents), toutes mises à jour d'un coup.
**Technique** : Ajout d'un workflow GitHub Actions (`.github/workflows/deploy-gas.yml`) qui exécute `clasp push`, retire l'ancien déploiement, en crée un nouveau, et met à jour le lien short.io via son API (`.github/scripts/deploy-gas.sh`), pour chaque cible listée dans `deploy-targets.json`. La description de chaque déploiement Apps Script reprend maintenant le message du commit (tronqué) au lieu du hash brut.

### Corrigé
**Humanisé** : La synchro automatique cassait le site en le déployant (le code des tests se retrouvait mélangé au vrai code, ce qui faisait planter tout le site à l'ouverture). Réparé.
**Technique** : `clasp push` n'avait pas de filtre et poussait tout le dépôt, y compris `tests/`. Apps Script exécute tous les fichiers `.gs`/`.js` d'un projet dans un seul scope global partagé ; les 12 fichiers de test déclarant chacun `const { loadGas } = require('./harness')` en tête de fichier entraient en collision (identifiant dupliqué), cassant l'exécution de tout le projet déployé. Ajout de `.claspignore` pour ne pousser que `Code.gs`, `AutoPoints.gs`, `Index.html`, `Mobile.html` et `appsscript.json`.

**Humanisé** : Le site restait bloqué sur "Chargement…" puis devenait tout blanc à l'ouverture, aussi bien sur PC que sur mobile. Maintenant le lien de base ouvre directement la version PC ; le bouton 📱/🖥️ en haut de l'écran permet de passer sur mobile, et ce choix est ensuite mémorisé.
**Technique** : `doGet()` sans `?view=` servait une mini-page de redirection auto-détectant l'appareil puis se rechargeant elle-même via `window.location.href`. Dans l'iframe sandbox du déploiement réel, Google bloque silencieusement toute navigation déclenchée par du script sans geste utilisateur réel — confirmé en testant qu'une navigation tapée à la main vers `?view=desktop` fonctionne, contrairement à la redirection automatique, que ce soit servie comme chaîne brute (`createHtmlOutput`) ou comme fichier (`createHtmlOutputFromFile`, tenté en premier et insuffisant). Suppression de cette page intermédiaire : `doGet()` sert directement `Index.html` par défaut (et sur toute valeur `?view=` non reconnue), `Mobile.html` uniquement sur `?view=mobile` explicite. Le bouton de bascule existant reste fonctionnel car un clic constitue un geste utilisateur valide pour le sandbox.
