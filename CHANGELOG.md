# Changelog

Toutes les modifications notables de ce projet sont documentées ici.

Format basé sur [Keep a Changelog](https://keepachangelog.com).

## [Non publié] - 2026-07-08

### Corrigé
**Humanisé** : Le site restait bloqué sur "Chargement…" puis devenait tout blanc à l'ouverture, aussi bien sur PC que sur mobile. Maintenant le lien de base ouvre directement la version PC ; le bouton 📱/🖥️ en haut de l'écran permet de passer sur mobile, et ce choix est ensuite mémorisé.
**Technique** : `doGet()` sans `?view=` servait une mini-page de redirection auto-détectant l'appareil puis se rechargeant elle-même via `window.location.href`. Dans l'iframe sandbox du déploiement réel, Google bloque silencieusement toute navigation déclenchée par du script sans geste utilisateur réel — confirmé en testant qu'une navigation tapée à la main vers `?view=desktop` fonctionne, contrairement à la redirection automatique, que ce soit servie comme chaîne brute (`createHtmlOutput`) ou comme fichier (`createHtmlOutputFromFile`, tenté en premier et insuffisant). Suppression de cette page intermédiaire : `doGet()` sert directement `Index.html` par défaut (et sur toute valeur `?view=` non reconnue), `Mobile.html` uniquement sur `?view=mobile` explicite. Le bouton de bascule existant reste fonctionnel car un clic constitue un geste utilisateur valide pour le sandbox.
