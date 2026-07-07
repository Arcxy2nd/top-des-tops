# 🏆 Top-des-Tops

Application web de suivi de scores pour un groupe de joueurs. Chaque joueur accumule des points en participant à des **Tops** — jeux, défis, activités, n'importe quoi qui mérite un classement.

Hébergée sur Google Apps Script. Zéro serveur, zéro base de données externe, zéro dépendance npm. Tout tourne dans un Google Sheet.

---

## Ce que ça fait

- **Saisie en lot** — ajoute plusieurs scores d'un coup, avec joueur, catégorie, points et date
- **Dashboard** — graphiques filtrables par joueur, catégorie et période (empilé, groupé, courbes, radar, donut, classement)
- **Commentaires** — phrases paramétriques générées depuis le classement, entièrement personnalisables
- **Notes** — espace libre par joueur pour annoter les sessions
- **Historique** — tableau paginé avec édition et suppression
- **Outils** — rapport de santé des données, nettoyage des orphelins, fusion de lots

---

## Stack

| Couche | Techno |
|--------|--------|
| Backend | Google Apps Script |
| Frontend | HTML / CSS / JS (fichier unique) |
| Stockage | Google Sheets |
| Graphiques | Chart.js |
| Déploiement | Web App GAS (`/exec`) |

---

## Déploiement

1. Copier `Code.gs` et `Index.html` dans un projet Google Apps Script
2. Ajouter `SPREADSHEET_ID` dans les propriétés du script
3. Déployer en Web App — exécuté en tant que propriétaire, accès : tout compte Google
4. L'URL `/exec` reste stable entre les versions

Pour le détail pas-à-pas : [`DEPLOIEMENT.md`](DEPLOIEMENT.md)

---

## Structure du projet

```
Code.gs          — backend complet (services, API)
Index.html       — frontend monofichier (UI, graphiques, logique)
Mobile.html      — interface mobile dédiée
AutoPoints.gs    — attribution automatique de points
appsscript.json  — configuration GAS
tests/           — harness Node VM pour tester sans déployer
docs/            — plans et specs de développement
```

---

*Fait pour jouer en groupe. Pas pour faire du mal.*
