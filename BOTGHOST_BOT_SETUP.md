# Guide de mise en place — Bot Discord BotGhost pour top-des-tops

Ce guide est destiné à la personne qui configure le bot sur **BotGhost**. Il couvre tout ce qu'il faut faire, dans l'ordre, pour que les commandes Discord fonctionnent avec l'application top-des-tops.

---

## 1. Vue d'ensemble — comment ça marche

```
Joueur Discord
     │  tape /ajouter-points, /classement, etc.
     ▼
BotGhost (bot Discord)
     │  bloc "Send an API Request" (GET)
     ▼
Relais Cloudflare Worker   ← À CRÉER (section 3)
     │  transmet la requête telle quelle, suit la redirection Google
     ▼
Google Apps Script (top-des-tops)
     │  lit/écrit dans le Google Sheet
     ▼
Réponse JSON  →  Cloudflare Worker  →  BotGhost  →  message Discord
```

**Pourquoi un relais Cloudflare Worker ?** Toute URL `/exec` d'une Web App Google Apps Script redirige automatiquement (HTTP 302) vers un autre domaine Google avant de renvoyer le vrai contenu — c'est un comportement de Google, non désactivable. BotGhost ne suit pas cette redirection (vérifié : un test direct donne `status 302, response ""`). Le relais Cloudflare Worker, lui, suit la redirection automatiquement et renvoie le contenu final à BotGhost. Sans ce relais, aucune commande ne peut fonctionner, quelle que soit la façon dont elle est configurée dans BotGhost.

---

## 2. Déjà fait côté projet (rien à faire ici)

- Le backend (`DiscordBridge.gs`) est écrit, testé et déployé sur une copie de test Google Apps Script.
- Le Sheet de test est peuplé avec de vrais joueurs (Discord ID déjà lié pour au moins un joueur de test).
- L'autorisation du script et les Script Properties (`SPREADSHEET_ID`, `DISCORD_BRIDGE_SECRET`) sont configurées.
- Lien fixe actuel (ne change pas entre deux mises à jour du code) :
  ```
  https://script.google.com/macros/s/AKfycbxCweaDEZScvtGltvt3jtOhXgbRqfe5Gh_i3xKp6vIbLhi2A75grQW2OeUGtger5N9e/exec
  ```
- Secret partagé (à utiliser tel quel dans les paramètres, jamais affiché aux joueurs) :
  ```
  7a791f74704bd965e36907975bf3377fad8408be
  ```

**Ce qui reste à faire (ce guide) : créer le relais Cloudflare Worker, puis configurer les 6 commandes BotGhost pour qu'elles passent par ce relais.**

---

## 3. Créer le relais Cloudflare Worker

1. Va sur [dash.cloudflare.com](https://dash.cloudflare.com/sign-up) et crée un compte gratuit (email + mot de passe), ou connecte-toi si tu en as déjà un.
2. Dans le menu de gauche, clique sur **Workers & Pages**.
3. Clique sur **Create** (ou **Create application**), puis **Create Worker**.
4. Donne-lui un nom, par exemple `top-des-tops-bridge` (le nom devient une partie de l'URL finale, pas de caractère spécial).
5. Clique sur **Deploy** — Cloudflare crée un Worker par défaut ("Hello World"), c'est normal.
6. Clique sur **Edit code** (ou **Configure Worker** puis l'éditeur de code).
7. Supprime tout le contenu existant et colle exactement ce code :

```js
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = 'https://script.google.com/macros/s/AKfycbxCweaDEZScvtGltvt3jtOhXgbRqfe5Gh_i3xKp6vIbLhi2A75grQW2OeUGtger5N9e/exec' + url.search;
    const resp = await fetch(target, { redirect: 'follow' });
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: { 'Content-Type': resp.headers.get('Content-Type') || 'application/json' }
    });
  }
};
```

8. Clique sur **Save and Deploy** (ou **Deploy**).
9. Récupère l'URL du Worker, affichée en haut de la page — elle ressemble à :
   ```
   https://top-des-tops-bridge.<ton-sous-domaine>.workers.dev
   ```
   **C'est cette URL (pas celle de Google) qu'il faudra mettre dans BotGhost.** Note-la de côté.

10. Vérifie que ça marche avant de continuer : colle dans un navigateur
    ```
    https://top-des-tops-bridge.<ton-sous-domaine>.workers.dev/?bgAction=getLeaderboard&secret=7a791f74704bd965e36907975bf3377fad8408be
    ```
    Tu dois voir une réponse du type `{"ok":true,"message":"🥇 ..."}`. Si tu vois autre chose (page vide, erreur), le Worker n'est pas encore bien déployé — recommence l'étape 7-8.

---

## 4. Configurer les 6 commandes dans BotGhost

Pour **chaque** commande ci-dessous : un bloc **"Send an API Request"**, méthode **GET**, avec l'URL de base suivante remplacée par TON URL de Worker (celle de l'étape 3.9) :

```
BASE = https://top-des-tops-bridge.<ton-sous-domaine>.workers.dev
```

Mets les paramètres dans les champs **URL Params** du bloc (pas concaténés à la main dans le champ URL). Laisse **HTTP Headers** et **Request Body** vides. Dans l'onglet **Options**, active **"Sanitize response data"** si présent.

Après chaque bloc "Send an API Request", ajoute un bloc **Send Message** (ou équivalent) qui affiche `{nomDeLaRequete.response.message}` — c'est le texte déjà formaté que le joueur doit voir.

### 4.1 — `/ajouter-points`

Options Discord à créer sur la commande :
- `top` — texte, **requis**
- `points` — nombre entier, **requis**
- `description` — texte, optionnel
- `cible` — **utilisateur Discord** (type "User", pas texte), optionnel

URL Params :
| Clé | Valeur |
|---|---|
| `bgAction` | `addPoints` |
| `secret` | `7a791f74704bd965e36907975bf3377fad8408be` |
| `discordId` | variable native BotGhost pour l'ID de la personne qui tape la commande (souvent `{user.id}`) |
| `targetDiscordId` | ID de l'option `cible` |
| `top` | `{top}` |
| `points` | `{points}` |
| `desc` | `{description}` |

Comportement : si `cible` est vide, les points sont crédités au joueur lié au compte Discord de l'auteur lui-même.

### 4.2 — `/classement`

Aucune option Discord.

URL Params :
| Clé | Valeur |
|---|---|
| `bgAction` | `getLeaderboard` |
| `secret` | `7a791f74704bd965e36907975bf3377fad8408be` |

### 4.3 — `/ajouter-note`

Options Discord :
- `texte` — texte, **requis**
- `cible` — utilisateur Discord, optionnel

URL Params :
| Clé | Valeur |
|---|---|
| `bgAction` | `addNote` |
| `secret` | `7a791f74704bd965e36907975bf3377fad8408be` |
| `discordId` | ID de l'auteur de la commande |
| `targetDiscordId` | ID de l'option `cible` |
| `text` | `{texte}` |

### 4.4 — `/voir-notes`

Options Discord :
- `joueur` — **utilisateur Discord** (type "User"), **requis**

URL Params :
| Clé | Valeur |
|---|---|
| `bgAction` | `getNotes` |
| `secret` | `7a791f74704bd965e36907975bf3377fad8408be` |
| `targetDiscordId` | ID de l'option `joueur` |

### 4.5 — `listTops` (optionnel — pour autocomplétion sur l'option `top` de 4.1, si le champ existe dans BotGhost)

Aucune option Discord.

URL Params :
| Clé | Valeur |
|---|---|
| `bgAction` | `listTops` |
| `secret` | `7a791f74704bd965e36907975bf3377fad8408be` |

Réponse `choices` : tableau `[{name, value}]`, ex. `[{"name":"🏎️ Mario Kart","value":"Mario Kart"}]` — `value` est ce qu'il faut envoyer dans `top` (action 4.1).

### 4.6 — `listBareme` (optionnel — pour autocomplétion sur l'option `points` de 4.1, une fois `top` choisi)

Aucune option Discord propre — utilise le `top` déjà sélectionné dans la commande en cours.

URL Params :
| Clé | Valeur |
|---|---|
| `bgAction` | `listBareme` |
| `secret` | `7a791f74704bd965e36907975bf3377fad8408be` |
| `top` | `{top}` (optionnel — filtre sur ce Top ; omis, renvoie tous les Tops) |

Réponse `choices` : `[{name, value}]`, ex. `[{"name":"Victoire (+5 pts)","value":5}]` — `value` (un nombre) est ce qu'il faut envoyer dans `points` (action 4.1).

> Le contrat exact attendu par une source d'autocomplétion dynamique dans l'interface BotGhost (4.5 et 4.6) n'est pas documenté publiquement — à vérifier directement dans le command builder. Les actions 4.1 à 4.4 sont le cœur du bot et fonctionnent indépendamment de ça.

---

## 5. Tester, dans cet ordre

1. **`/classement`** en premier — aucune variable, le plus simple à valider. Doit afficher un classement (même à 0 pts).
2. **`/voir-notes`** en te ciblant toi-même (si ton compte Discord est déjà lié à un joueur du Sheet).
3. **`/ajouter-note`** sur toi-même, puis vérifie avec `/voir-notes` que la note apparaît.
4. **`/ajouter-points`** sur toi-même avec un Top qui existe déjà dans le Sheet (orthographe exacte).
5. Si tout marche, teste `cible`/`joueur` sur un autre joueur (dont le compte Discord est lié).

---

## 6. Lier un compte Discord à un joueur (pour référence — géré côté projet, pas par toi)

Chaque joueur qui veut utiliser le bot doit avoir son ID Discord dans la colonne **"Discord ID"** de l'onglet **Players** du Google Sheet (remplie à la main par le gestionnaire du projet). Sans ça, le bot répond : *"Ton compte Discord n'est lié à aucun joueur."*

Pour qu'un joueur récupère son propre ID Discord : Paramètres Discord → Avancés → activer **Mode développeur** → clic droit sur son propre nom/avatar → **Copier l'ID utilisateur**.

---

## 7. Dépannage

| Symptôme | Cause probable |
|---|---|
| Le bot renvoie la page HTML de l'app top-des-tops | Le relais Cloudflare Worker n'est pas utilisé (URL pointant encore vers Google directement), ou mal déployé |
| `Test Request` dans BotGhost affiche `status: 302, response: ""` | Normal si l'URL testée est encore celle de Google — passe par le Worker |
| `"Non autorisé."` | Le paramètre `secret` est manquant ou ne correspond pas exactement à `7a791f74704bd965e36907975bf3377fad8408be` |
| `"Ton compte Discord n'est lié à aucun joueur."` | L'ID Discord de la personne n'est pas (ou mal) renseigné dans la colonne Discord ID de Players |
| `"Top inconnu : '...'"` | Faute de frappe dans le nom du Top, ou Top absent du Sheet — vérifie l'orthographe exacte dans l'onglet Categories |
| `"Les points doivent être un entier ≥ 1."` | Valeur de `points` vide, non numérique, à 0 ou négative |
| Rien ne se passe dans Discord après la commande | Le bloc "Send an API Request" a fonctionné mais le bloc **Send Message** juste après est absent ou mal configuré |

---

## 8. Pour plus tard — passage en production

Ce guide couvre la **copie de test**. Le jour où le bot passe sur les vraies instances ("Site tops" / "Tops RDS") :
- L'URL cible dans le code du Worker (ligne `target = '...'`) devra pointer vers le **lien court stable** de l'instance concernée (pas l'URL `/exec` brute, qui change à chaque déploiement en prod) — une seule ligne à modifier dans le Worker, rien à refaire côté BotGhost.
- Le secret sera probablement différent par instance (à confirmer avec le gestionnaire du projet).
