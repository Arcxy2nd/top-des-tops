# Synchronisation automatique GitHub → Google Apps Script

## Contexte

Le projet top-des-tops est hébergé sur Google Apps Script (GAS), sans serveur ni CI existante. Aujourd'hui, chaque mise à jour se fait manuellement dans l'éditeur GAS :

1. Remplacer/sauvegarder le code de chaque fichier dans l'éditeur en ligne
2. Archiver le déploiement actuel
3. Redéployer (nouvelle version, nouvelle URL `/exec`)
4. Mettre à jour le lien court sur short.io pour qu'il pointe vers la nouvelle URL

L'objectif est d'automatiser entièrement ce cycle : un simple `git push` sur `main` doit suffire à mettre à jour le code, redéployer, et maintenir le lien public stable.

## Décisions validées

- **Déclencheur** : GitHub Actions, sur chaque push vers `main`.
- **Portée** : push + déploiement (nouvelle version publique) automatiques, sans étape manuelle.
- **Stratégie de déploiement** : conserver l'habitude actuelle — archiver l'ancien déploiement et en créer un nouveau à chaque fois (donc une nouvelle URL `/exec` à chaque déploiement), plutôt que réutiliser un déploiement fixe.
- **Stabilité du lien public** : le lien court short.io existant reste la seule URL communiquée aux utilisateurs ; il est repointé automatiquement vers la nouvelle URL `/exec` à chaque déploiement.

## Architecture

```
git push origin main
        │
        ▼
GitHub Actions (.github/workflows/deploy-gas.yml)
        │
        ├─ 1. clasp push --force            (synchronise Code.gs, AutoPoints.gs, Index.html,
        │                                     Mobile.html, appsscript.json vers l'éditeur GAS)
        │
        ├─ 2. Repérer l'ancien déploiement web app actif (clasp deployments)
        │
        ├─ 3. clasp undeploy <ancien-id>     (retire l'ancien déploiement)
        │
        ├─ 4. clasp deploy --description "auto: <sha>"
        │                                     (crée un nouveau déploiement → nouvelle URL /exec)
        │
        └─ 5. POST https://api.short.io/links/<SHORTIO_LINK_ID>
                                              (repointe le lien court vers la nouvelle URL /exec)
```

## Composants

### `.clasp.json` (committé, non sensible)

```json
{
  "scriptId": "<ID du script container-bound, trouvé dans Apps Script → Paramètres du projet>",
  "rootDir": "."
}
```

### Secrets GitHub (Settings → Secrets and variables → Actions)

| Secret | Contenu | Sensible |
|--------|---------|----------|
| `CLASPRC_JSON` | Contenu de `~/.clasprc.json` généré après `clasp login` en local | Oui — contient un refresh token OAuth |
| `SHORTIO_API_KEY` | Clé API du compte short.io | Oui |
| `SHORTIO_LINK_ID` | Identifiant du lien court existant | Non sensible mais gardé en secret par simplicité |

### Workflow `.github/workflows/deploy-gas.yml`

Déclenché sur `push` vers `main` (uniquement si un des fichiers GAS a changé : `*.gs`, `*.html`, `appsscript.json`, `.clasp.json`).

Étapes :
1. `actions/checkout@v4`
2. Installer Node.js + `@google/clasp` globalement
3. Restaurer `~/.clasprc.json` depuis le secret `CLASPRC_JSON`
4. `clasp push --force`
5. Script shell : lister les déploiements existants (`clasp deployments`), identifier celui qui n'est pas la version `@HEAD` (dev), en extraire l'ID
6. `clasp undeploy <id>` sur cet ancien déploiement
7. `clasp deploy --description "auto: ${{ github.sha }}"` — capturer le nouvel ID de déploiement depuis la sortie
8. Construire la nouvelle URL : `https://script.google.com/macros/s/<nouvel-id>/exec`
9. Appel `curl` vers l'API short.io (`POST /links/<SHORTIO_LINK_ID>` avec le nouveau `originalURL`)

### Gestion des erreurs

- Si l'étape `clasp push` échoue (erreur de syntaxe, script ID invalide) : le job s'arrête avant toute action de déploiement. Le lien public actuel n'est pas touché.
- Si `clasp push` réussit mais que le code contient un bug logique : il sera quand même déployé (comportement accepté explicitement — c'est le choix "tout automatique").
- Si l'étape short.io échoue **après** un déploiement réussi : le nouveau code est en ligne sous une nouvelle URL `/exec`, mais le lien court pointe encore vers l'ancienne URL (désormais supprimée/inactive). Le job doit se terminer en échec (rouge dans l'onglet Actions) pour signaler clairement qu'une correction manuelle du lien short.io est nécessaire.
- Chaque étape logue son résultat dans les logs GitHub Actions pour permettre un diagnostic rapide en cas d'échec.

## Mise en place ponctuelle (à faire une fois, par l'utilisateur)

1. `npm install -g @google/clasp`
2. `clasp login` (ouvre une fenêtre OAuth dans le navigateur)
3. Récupérer l'ID du script existant : Apps Script → icône engrenage "Paramètres du projet" → "ID du projet Apps Script"
4. `clasp deployments` pour identifier le déploiement actif actuel (celui qui sert l'URL `/exec` en cours d'usage)
5. Récupérer la clé API et l'ID du lien court depuis le dashboard short.io
6. Ajouter les 3 secrets GitHub (`CLASPRC_JSON`, `SHORTIO_API_KEY`, `SHORTIO_LINK_ID`)
7. Committer `.clasp.json` et le workflow

## Test / vérification

Le projet n'a pas de suite de tests automatisés ([context.md](../../../context.md) §8). Vérification manuelle après mise en place :

1. Faire un petit changement (ex. commentaire ou modification mineure visible)
2. Push vers `main`
3. Observer le job dans l'onglet Actions de GitHub jusqu'au bout (vert)
4. Ouvrir le lien short.io existant et confirmer que le changement est visible
5. Vérifier dans Apps Script que l'ancien déploiement a bien disparu de la liste et qu'un nouveau est présent

## Hors périmètre

- Pas de tests automatisés du code GAS lui-même (le projet n'en a pas et ce n'est pas demandé ici).
- Pas de rollback automatique en cas de bug logique déployé — l'utilisateur redéploiera manuellement une version antérieure si besoin via l'éditeur GAS.
- Pas de gestion multi-environnement (staging/prod) — un seul déploiement de production, comme aujourd'hui.
