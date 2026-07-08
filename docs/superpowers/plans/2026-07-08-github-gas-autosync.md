# GitHub → Google Apps Script Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On every `git push` to `main`, automatically push the GAS source files, retire the old web app deployment, create a new one, and repoint the existing short.io link to the new `/exec` URL — replicating the current manual workflow (archive + redeploy + update short link) with zero manual steps.

**Architecture:** A GitHub Actions workflow triggered on push to `main` runs `clasp` (Google's Apps Script CLI) to push code and manage deployments, then calls the short.io API directly via `curl` to update the link destination. All deployment/undeploy/short.io logic lives in one bash script so the workflow YAML stays thin.

**Tech Stack:** GitHub Actions (`ubuntu-latest`), Node.js + `@google/clasp`, bash, `curl`, short.io REST API.

---

## File Structure

| File | Responsibility |
|------|-----------------|
| `SETUP-AUTOSYNC.md` (new) | One-time manual setup instructions (clasp login, secrets, IDs) — cannot be scripted, must be done by the project owner. |
| `.clasp.json` (new) | Tells `clasp` which Apps Script project and which local folder to sync (root of repo). |
| `.github/scripts/deploy-gas.sh` (new) | All the logic: push code, find + undeploy the old web app deployment, create a new deployment, update the short.io link. |
| `.github/workflows/deploy-gas.yml` (new) | Triggers the script on push to `main` (path-filtered to GAS files) and on manual dispatch. |
| `DEPLOIEMENT.md` (modify) | Replace the manual "Étape 6 — Mettre à jour après une modification" section with a description of the automated flow. |
| `CHANGELOG.md` (modify) | Add an entry per project convention (§8 of `context.md`), two voices. |

---

### Task 1: One-time setup guide

**Files:**
- Create: `SETUP-AUTOSYNC.md`

- [ ] **Step 1: Write the setup guide**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add SETUP-AUTOSYNC.md
git commit -m "docs: add one-time setup guide for GAS auto-sync"
```

---

### Task 2: `.clasp.json` template

**Files:**
- Create: `.clasp.json`

- [ ] **Step 1: Create the file**

```json
{
  "scriptId": "REPLACE_WITH_YOUR_SCRIPT_ID",
  "rootDir": "."
}
```

- [ ] **Step 2: Verify it's valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('.clasp.json'))" && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add .clasp.json
git commit -m "chore: add clasp project config template"
```

---

### Task 3: Deploy script

**Files:**
- Create: `.github/scripts/deploy-gas.sh`

- [ ] **Step 1: Create the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "== 1/4: Pushing source to Apps Script =="
clasp push --force

echo "== 2/4: Locating previous web app deployment =="
DEPLOYMENTS_OUTPUT=$(clasp deployments)
echo "$DEPLOYMENTS_OUTPUT"

# clasp deployments prints lines like:
#   - AKfycbyyyy @HEAD (Development)
#   - AKfycbzzzz @3 - auto: <sha>
# We want the deployment ID that is NOT the @HEAD dev deployment.
OLD_DEPLOYMENT_ID=$(echo "$DEPLOYMENTS_OUTPUT" | grep '^- ' | grep -v '@HEAD' | awk '{print $2}' | tail -n1)

if [ -z "${OLD_DEPLOYMENT_ID:-}" ]; then
  echo "No previous non-HEAD deployment found. Skipping undeploy."
else
  echo "Undeploying previous deployment: $OLD_DEPLOYMENT_ID"
  clasp undeploy "$OLD_DEPLOYMENT_ID"
fi

echo "== 3/4: Creating new deployment =="
DEPLOY_OUTPUT=$(clasp deploy --description "auto: ${GITHUB_SHA}")
echo "$DEPLOY_OUTPUT"

# clasp deploy prints a line like: "- AKfycbwwww @4."
NEW_DEPLOYMENT_ID=$(echo "$DEPLOY_OUTPUT" | grep '^- ' | awk '{print $2}' | tail -n1 | sed 's/\.$//')

if [ -z "${NEW_DEPLOYMENT_ID:-}" ]; then
  echo "ERROR: could not parse the new deployment ID from clasp deploy output." >&2
  exit 1
fi

NEW_URL="https://script.google.com/macros/s/${NEW_DEPLOYMENT_ID}/exec"
echo "New deployment URL: $NEW_URL"

echo "== 4/4: Updating short.io link =="
HTTP_STATUS=$(curl -s -o /tmp/shortio_response.json -w "%{http_code}" -X POST \
  "https://api.short.io/links/${SHORTIO_LINK_ID}" \
  -H "Authorization: ${SHORTIO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"originalURL\": \"${NEW_URL}\"}")

cat /tmp/shortio_response.json

if [ "$HTTP_STATUS" -ge 400 ]; then
  echo "ERROR: short.io update failed with HTTP $HTTP_STATUS." >&2
  echo "The new code IS live at $NEW_URL but the short.io link was NOT updated. Fix it manually in the short.io dashboard." >&2
  exit 1
fi

echo "Done. Short.io link now points to $NEW_URL"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x .github/scripts/deploy-gas.sh
```

- [ ] **Step 3: Verify the script has no syntax errors**

Run: `bash -n .github/scripts/deploy-gas.sh && echo OK`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add .github/scripts/deploy-gas.sh
git commit -m "feat: add GAS deploy + short.io repoint script"
```

---

### Task 4: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/deploy-gas.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: Deploy to Google Apps Script

on:
  push:
    branches: [main]
    paths:
      - '**.gs'
      - '**.html'
      - 'appsscript.json'
      - '.clasp.json'
      - '.github/workflows/deploy-gas.yml'
      - '.github/scripts/deploy-gas.sh'
  workflow_dispatch: {}

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install clasp
        run: npm install -g @google/clasp

      - name: Restore clasp credentials
        run: echo '${{ secrets.CLASPRC_JSON }}' > ~/.clasprc.json

      - name: Push and redeploy
        env:
          SHORTIO_API_KEY: ${{ secrets.SHORTIO_API_KEY }}
          SHORTIO_LINK_ID: ${{ secrets.SHORTIO_LINK_ID }}
        run: bash .github/scripts/deploy-gas.sh
```

- [ ] **Step 2: Validate YAML syntax**

Run: `node -e "require('js-yaml') ? '' : ''" 2>/dev/null; python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-gas.yml'))" && echo OK`
Expected: `OK` (if `python3`/`yaml` isn't available locally, this step is verified instead when the workflow runs in Task 6)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-gas.yml
git commit -m "feat: add GitHub Actions workflow for GAS auto-sync"
```

---

### Task 5: Update deployment docs

**Files:**
- Modify: `DEPLOIEMENT.md:61-71` (section "Étape 6 — Mettre à jour après une modification du code")

- [ ] **Step 1: Replace the manual update section**

Replace the existing "## Étape 6" section content with:

```markdown
## Étape 6 — Mettre à jour après une modification du code

Depuis la mise en place de la synchronisation automatique (voir `SETUP-AUTOSYNC.md`), cette étape est **automatique** :

1. Modifie `Code.gs`, `AutoPoints.gs`, `Index.html`, `Mobile.html` ou `appsscript.json` localement
2. `git push` vers `main`
3. GitHub Actions pousse le code, archive l'ancien déploiement, en crée un nouveau, et met à jour le lien short.io — sans action manuelle

Tu peux suivre la progression dans l'onglet **Actions** du dépôt GitHub. En cas d'échec (visible en rouge), les logs indiquent l'étape fautive.
```

- [ ] **Step 2: Commit**

```bash
git add DEPLOIEMENT.md
git commit -m "docs: document automated deployment flow"
```

---

### Task 6: Changelog entry

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the entry at the top of the file (after the header, above the most recent existing entry)**

```markdown
## [Unreleased]

### Ajouté
**Humanisé** : Les mises à jour du code se déploient maintenant automatiquement dès qu'elles sont envoyées sur GitHub — plus besoin de recopier les fichiers ni de redéployer à la main, le lien court reste toujours valide.
**Technique** : Ajout d'un workflow GitHub Actions (`.github/workflows/deploy-gas.yml`) qui exécute `clasp push`, retire l'ancien déploiement, en crée un nouveau, et met à jour le lien short.io via son API (`.github/scripts/deploy-gas.sh`).
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog entry for GAS auto-sync"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Complete the one-time setup from `SETUP-AUTOSYNC.md`**

This must be done by the project owner (OAuth login, secrets, real script ID) — cannot be performed by an agent.

- [ ] **Step 2: Trigger a manual test run**

In the GitHub repo: **Actions → Deploy to Google Apps Script → Run workflow → Run workflow** (uses the `workflow_dispatch` trigger added in Task 4, no code change needed).

- [ ] **Step 3: Watch the run to completion**

Expected: all steps green, log ends with `Done. Short.io link now points to https://script.google.com/macros/s/.../exec`

- [ ] **Step 4: Confirm the short.io link resolves to the new deployment**

Open the existing short.io link in a browser. Expected: the app loads normally.

- [ ] **Step 5: Confirm the old deployment is gone**

In Apps Script → **Déployer → Gérer les déploiements**: only the new deployment should be listed as an active web app deployment (plus the dev `@HEAD` entry, which is normal and untouched).

---

## Self-Review Notes

- **Spec coverage**: every section of the spec (trigger, push, undeploy old, deploy new, short.io repoint, error handling, one-time setup, verification) maps to a task above.
- **Placeholders**: `REPLACE_WITH_YOUR_SCRIPT_ID` in `.clasp.json` is intentional user-supplied data (like a `.env.example` value), not a deferred implementation detail — it's resolved in Task 1/7 by the project owner before first use.
- **Type/name consistency**: `deploy-gas.sh` is referenced identically in the workflow (Task 4), `SETUP-AUTOSYNC.md` is referenced identically from `DEPLOIEMENT.md` (Task 5) and Task 1.
