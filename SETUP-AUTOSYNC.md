# Mise en place de la synchronisation automatique GitHub → Apps Script

Cette procédure ne se fait **qu'une seule fois**, par le propriétaire du projet. Elle ne peut pas être automatisée car elle nécessite une connexion OAuth interactive dans un navigateur.

## 1. Installer et authentifier clasp

Sur ta machine (PowerShell) :

```powershell
npm install -g @google/clasp
clasp login
```

Une fenêtre de navigateur s'ouvre pour te connecter à ton compte Google. Une fois fait, un fichier `~/.clasprc.json` (sur Windows : `C:\Users\<toi>\.clasprc.json`) est créé.

## 2. Récupérer l'ID du script Apps Script

1. Ouvre le projet dans [script.google.com](https://script.google.com)
2. Clique sur l'icône engrenage **"Paramètres du projet"** à gauche
3. Copie la valeur **"ID du projet Apps Script"**

## 3. Mettre à jour `.clasp.json`

Ouvre `.clasp.json` à la racine du repo et remplace `REPLACE_WITH_YOUR_SCRIPT_ID` par l'ID copié à l'étape 2.

## 4. Récupérer les informations short.io

1. Connecte-toi sur [app.short.io](https://app.short.io)
2. Récupère ta clé API : **Settings → API Key**
3. Récupère l'ID du lien court existant : dans la liste des liens, clique sur celui utilisé pour top-des-tops, l'ID apparaît dans l'URL du dashboard ou via l'API `GET https://api.short.io/api/links?domain_id=<...>`

## 5. Ajouter les secrets GitHub

Dans le dépôt GitHub : **Settings → Secrets and variables → Actions → New repository secret**. Ajoute ces trois secrets :

| Nom | Valeur |
|-----|--------|
| `CLASPRC_JSON` | Le contenu complet du fichier `~/.clasprc.json` généré à l'étape 1 |
| `SHORTIO_API_KEY` | La clé API récupérée à l'étape 4 |
| `SHORTIO_LINK_ID` | L'ID du lien court récupéré à l'étape 4 |

## 6. Committer `.clasp.json`

```powershell
git add .clasp.json
git commit -m "chore: configure clasp for GAS auto-sync"
git push
```

À partir de là, chaque push sur `main` qui touche un fichier `.gs`, `.html` ou `appsscript.json` déclenche automatiquement la synchronisation et le redéploiement.
