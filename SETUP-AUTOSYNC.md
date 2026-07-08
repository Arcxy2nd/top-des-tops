# Mise en place de la synchronisation automatique GitHub → Apps Script

Cette procédure ne se fait **qu'une seule fois**, par le propriétaire du projet. Elle ne peut pas être automatisée car elle nécessite une connexion OAuth interactive dans un navigateur.

Le même code de ce dépôt est déployé vers **plusieurs copies Apps Script** (même script, Google Sheet différent à chaque fois). Chaque copie est une "cible" listée dans `deploy-targets.json`.

## 1. Installer et authentifier clasp

Sur ta machine (PowerShell) :

```powershell
npm install -g @google/clasp
clasp login
```

Une fenêtre de navigateur s'ouvre pour te connecter à ton compte Google. Une fois fait, un fichier `~/.clasprc.json` (sur Windows : `C:\Users\<toi>\.clasprc.json`) est créé.

## 2. Récupérer l'ID de script de chaque copie

Pour **chaque copie Apps Script** à synchroniser :

1. Ouvre le projet dans [script.google.com](https://script.google.com)
2. Clique sur l'icône engrenage **"Paramètres du projet"** à gauche
3. Copie la valeur **"ID du projet Apps Script"**

## 3. Récupérer les informations short.io de chaque copie

1. Connecte-toi sur [app.short.io](https://app.short.io)
2. Récupère ta clé API (partagée pour toutes les copies) : **Settings → API Key**
3. Pour chaque copie, récupère l'ID du lien court correspondant : dans la liste des liens, clique sur celui utilisé pour cette copie, l'ID apparaît dans l'URL du dashboard ou via l'API `GET https://api.short.io/api/links?domain_id=<...>`

## 4. Remplir `deploy-targets.json`

Ouvre `deploy-targets.json` à la racine du repo et remplace les valeurs `REPLACE_WITH_...` pour chaque copie :

```json
[
  {
    "name": "top-des-tops",
    "scriptId": "<ID récupéré à l'étape 2 pour cette copie>",
    "shortioLinkId": "<ID récupéré à l'étape 3 pour cette copie>"
  },
  {
    "name": "<nom de la deuxième copie>",
    "scriptId": "<ID de la deuxième copie>",
    "shortioLinkId": "<ID du lien court de la deuxième copie>"
  }
]
```

Pour ajouter une troisième copie plus tard, ajoute simplement une nouvelle entrée dans ce tableau — aucune autre modification n'est nécessaire.

## 5. Ajouter les secrets GitHub

Dans le dépôt GitHub : **Settings → Secrets and variables → Actions → New repository secret**. Ajoute ces deux secrets (partagés pour toutes les copies) :

| Nom | Valeur |
|-----|--------|
| `CLASPRC_JSON` | Le contenu complet du fichier `~/.clasprc.json` généré à l'étape 1 |
| `SHORTIO_API_KEY` | La clé API récupérée à l'étape 3 |

## 6. Committer `deploy-targets.json`

```powershell
git add deploy-targets.json
git commit -m "chore: configure clasp deploy targets for GAS auto-sync"
git push
```

À partir de là, chaque push sur `main` qui touche un fichier `.gs`, `.html` ou `appsscript.json` déclenche automatiquement la synchronisation et le redéploiement vers **toutes les copies** listées dans `deploy-targets.json`.

## Note sur `.clasp.json`

Le fichier `.clasp.json` à la racine n'est utilisé que pour un `clasp push` **manuel** depuis ta machine (par exemple pour tester). Le workflow automatique régénère ce fichier lui-même pour chaque cible listée dans `deploy-targets.json` — tu n'as pas besoin de le synchroniser avec ce fichier.
