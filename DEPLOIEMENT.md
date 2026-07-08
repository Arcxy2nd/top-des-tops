# Rendre l'application publique — Guide complet

## Étape 1 — Ouvrir le projet dans Apps Script

1. Va sur [script.google.com](https://script.google.com)
2. Ouvre le projet **top-des-tops**

---

## Étape 2 — Configurer le SPREADSHEET_ID (une seule fois)

Si ce n'est pas encore fait, il faut dire au script quelle feuille Google Sheets utiliser.

1. Dans l'éditeur, clique sur le menu **"Exécuter"** en haut
2. Clique sur **"Exécuter la fonction"**
3. Choisis la fonction `setup` ou `setSpreadsheetId` si elle existe  
   *(si elle n'existe pas, voir note en bas de page)*
4. Accepte les permissions demandées

---

## Étape 3 — Déployer l'application web

1. Clique sur le bouton **"Déployer"** en haut à droite
2. Choisis **"Nouveau déploiement"**
3. Clique sur l'icône **engrenage** à côté de "Sélectionner le type" → choisis **"Application Web"**
4. Remplis les champs :
   - **Description** : `v1` (ou ce que tu veux)
   - **Exécuter en tant que** : `Moi (ton adresse email)`
   - **Qui a accès** : `Tout utilisateur avec un compte Google`  
     *(avec un compte Gmail personnel, c'est le maximum disponible — l'option "Tout le monde" sans compte n'existe plus pour les comptes non-professionnels)*
5. Clique sur **"Déployer"**

> Les personnes qui ouvrent le lien devront être connectées à n'importe quel compte Google.
> Elles n'ont pas besoin d'avoir accès à ta feuille Sheets — le script tourne en ton nom.

---

## Étape 4 — Autoriser le script (avertissement de sécurité)

Google va afficher un écran **"Google n'a pas validé cette application"**. C'est normal pour un script personnel, il faut juste passer outre.

1. Clique sur **"Paramètres avancés"** en bas à gauche de la fenêtre
2. Clique sur **"Accéder à [nom du projet] (non sécurisé)"**
3. Clique sur **"Autoriser"**

Cette étape ne se fait **qu'une seule fois**. Les personnes qui utilisent le lien ensuite ne verront pas cet écran.

---

## Étape 5 — Récupérer le lien public

Après le déploiement, une fenêtre s'affiche avec :

> **URL de l'application web** : `https://script.google.com/macros/s/XXXXXXX/exec`

**Copie ce lien.** C'est l'URL à partager avec tout le monde.

---

## Étape 6 — Mettre à jour après une modification du code

Depuis la mise en place de la synchronisation automatique (voir `SETUP-AUTOSYNC.md`), cette étape est **automatique** :

1. Modifie `Code.gs`, `AutoPoints.gs`, `Index.html`, `Mobile.html` ou `appsscript.json` localement
2. `git push` vers `main`
3. GitHub Actions pousse le code, archive l'ancien déploiement, en crée un nouveau, et met à jour le lien short.io — sans action manuelle, pour **chaque copie** listée dans `deploy-targets.json`

Tu peux suivre la progression dans l'onglet **Actions** du dépôt GitHub. En cas d'échec sur une copie (visible en rouge), les logs indiquent laquelle et à quelle étape ; les autres copies sont quand même mises à jour.

---

## Note — Message "Vous n'êtes pas autorisé à appeler ScriptApp.getProjectTriggers"

Ce message peut apparaître dans l'onglet 🔧 Outils → 🤖 Points automatiques ("Exécution automatique"). Ce n'est pas un bug : c'est Google qui demande une autorisation supplémentaire, que les déploiements automatiques (via `clasp`/GitHub Actions) ne peuvent pas accorder eux-mêmes — seul un humain peut cliquer "Autoriser" dans l'éditeur.

L'app continue de fonctionner normalement pour tout le reste ; seule la case à cocher "activer/désactiver l'exécution automatique" reste indisponible tant que l'autorisation n'a pas été donnée.

**Pour corriger, une seule fois par copie du script :**

1. Ouvre le projet dans [script.google.com](https://script.google.com)
2. Dans l'éditeur, sélectionne la fonction `runAutoPoints` dans le menu déroulant en haut
3. Clique sur **"Exécuter"**
4. Google affiche l'écran d'autorisation ("Google n'a pas validé cette application") — clique **"Paramètres avancés"** puis **"Accéder à [nom du projet] (non sécurisé)"** puis **"Autoriser"** (même écran qu'à l'Étape 4 du déploiement initial)
5. Recharge l'app : le message disparaît, l'exécution automatique des règles de points redevient disponible

---

## Note — Si le SPREADSHEET_ID n'est pas configuré

Si l'app affiche une erreur `SPREADSHEET_ID est manquant`, il faut le configurer manuellement :

1. Dans Apps Script, clique sur **"Paramètres du projet"** (icône engrenage à gauche)
2. Descends jusqu'à **"Propriétés du script"**
3. Clique sur **"Ajouter une propriété"**
4. Mets :
   - Propriété : `SPREADSHEET_ID`
   - Valeur : l'ID de ta feuille Google Sheets *(c'est la partie longue dans l'URL de ton sheet, entre `/d/` et `/edit`)*
5. Clique sur **"Enregistrer"**
