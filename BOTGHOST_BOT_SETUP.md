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
GET https://tops-site-tops.vercel.app/api/discord  (ou tops-rds.vercel.app)
     │  répond directement en 200
     ▼
Google Sheets (top-des-tops)
     │  lit/écrit dans le Sheet
     ▼
Réponse JSON  →  BotGhost  →  message Discord
```

**Aucun relais dans ce chemin.** Une Web App Google Apps Script répond par une redirection HTTP 302, que BotGhost ne suit pas ; l'endpoint Vercel répond directement en 200, donc BotGhost peut l'appeler tel quel.

---

## 2. Environnements disponibles (Test vs Production)

Le code du bridge Discord (`DiscordBridge.gs` branché sur `doGet`) est désormais déployé sur tous les environnements. Tu peux connecter ton bot soit à la copie de test, soit directement au **site en production** (« Site tops » ou « Tops RDS ») :

### Option A — Site en production (« Site tops », recommandé pour l'usage réel)
- **Prérequis uniques en production** :
  1. Dans le Google Sheet de production, onglet **Players** : ajouter l'en-tête `Discord ID` en colonne F (à côté d'Ordre) et renseigner les identifiants numériques Discord des joueurs.
  2. Rien à saisir côté Google : le secret n'est plus une propriété du script Apps Script. Il vit uniquement comme variable d'environnement Vercel `DISCORD_BRIDGE_SECRET`, sur le projet Vercel qui héberge l'endpoint — l'endpoint la lit directement dans son contexte d'exécution au moment de vérifier chaque requête. Une seule source de vérité, à recopier telle quelle dans les blocs BotGhost (section 3).

### Option B — Copie de test (pour tester sans toucher au vrai classement)
- Même mécanisme de secret qu'en Option A (variable Vercel `DISCORD_BRIDGE_SECRET`), sur le projet Vercel de la copie de test.

---

## 3. Configurer les 6 commandes dans BotGhost

Pour **chaque** commande ci-dessous : un bloc **"Send an API Request"**, méthode **GET**, avec l'URL de base suivante (identique pour les 6 blocs d'une même instance) :

```
BASE = https://tops-site-tops.vercel.app/api/discord   (Site tops)
BASE = https://tops-rds.vercel.app/api/discord          (Tops RDS)
BASE = https://tops-des-tops-vercel.vercel.app/api/discord  (copie de test)
```

L'hôte de l'adresse désigne l'instance : le paramètre `tenant` est inutile (il ne sert que pour forcer une autre instance que celle de l'hôte). Secret : `BOT_SECRET.txt` à la racine du dépôt.

Mets les paramètres dans les champs **URL Params** du bloc (pas concaténés à la main dans le champ URL). Laisse **HTTP Headers** et **Request Body** vides. Dans l'onglet **Options**, active **"Sanitize response data"** si présent.

Après chaque bloc "Send an API Request", ajoute un bloc **Send Message** (ou équivalent) qui affiche `{nomDeLaRequete.response.message}` — c'est le texte déjà formaté que le joueur doit voir.

### 3.1 — `/ajouter-points`

Options Discord à créer sur la commande :
- `top` — texte, **requis**
- `points` — nombre entier, **requis**
- `description` — texte, optionnel
- `cible` — **utilisateur Discord** (type "User", pas texte), optionnel

URL Params :
| Clé | Valeur |
|---|---|
| `bgAction` | `addPoints` |
| `secret` | `<secret — voir la variable Vercel DISCORD_BRIDGE_SECRET>` |
| `tenant` | (optionnel) hôte de l'instance visée, ex. `tops-des-tops-vercel.vercel.app` — omis, l'hôte de la requête est utilisé |
| `discordId` | variable native BotGhost pour l'ID de la personne qui tape la commande (souvent `{user.id}`) |
| `targetDiscordId` | ID de l'option `cible` |
| `top` | `{top}` |
| `points` | `{points}` |
| `desc` | `{description}` |

Comportement : si `cible` est vide, les points sont crédités au joueur lié au compte Discord de l'auteur lui-même.

### 3.2 — `/classement`

Aucune option Discord.

URL Params :
| Clé | Valeur |
|---|---|
| `bgAction` | `getLeaderboard` |
| `secret` | `<secret — voir la variable Vercel DISCORD_BRIDGE_SECRET>` |
| `tenant` | (optionnel) hôte de l'instance visée, ex. `tops-des-tops-vercel.vercel.app` — omis, l'hôte de la requête est utilisé |

### 3.3 — `/ajouter-note`

Options Discord :
- `texte` — texte, **requis**
- `cible` — utilisateur Discord, optionnel

URL Params :
| Clé | Valeur |
|---|---|
| `bgAction` | `addNote` |
| `secret` | `<secret — voir la variable Vercel DISCORD_BRIDGE_SECRET>` |
| `tenant` | (optionnel) hôte de l'instance visée, ex. `tops-des-tops-vercel.vercel.app` — omis, l'hôte de la requête est utilisé |
| `discordId` | ID de l'auteur de la commande |
| `targetDiscordId` | ID de l'option `cible` |
| `text` | `{texte}` |

### 3.4 — `/voir-notes`

Options Discord :
- `joueur` — **utilisateur Discord** (type "User"), **requis**

URL Params :
| Clé | Valeur |
|---|---|
| `bgAction` | `getNotes` |
| `secret` | `<secret — voir la variable Vercel DISCORD_BRIDGE_SECRET>` |
| `tenant` | (optionnel) hôte de l'instance visée, ex. `tops-des-tops-vercel.vercel.app` — omis, l'hôte de la requête est utilisé |
| `targetDiscordId` | ID de l'option `joueur` |

### 3.5 — `listTops` (optionnel — pour autocomplétion sur l'option `top` de 3.1, si le champ existe dans BotGhost)

Aucune option Discord.

URL Params :
| Clé | Valeur |
|---|---|
| `bgAction` | `listTops` |
| `secret` | `<secret — voir la variable Vercel DISCORD_BRIDGE_SECRET>` |
| `tenant` | (optionnel) hôte de l'instance visée, ex. `tops-des-tops-vercel.vercel.app` — omis, l'hôte de la requête est utilisé |

Réponse `choices` : tableau `[{name, value}]`, ex. `[{"name":"🏎️ Mario Kart","value":"Mario Kart"}]` — `value` est ce qu'il faut envoyer dans `top` (action 3.1).

### 3.6 — `listBareme` (optionnel — pour autocomplétion sur l'option `points` de 3.1, une fois `top` choisi)

Aucune option Discord propre — utilise le `top` déjà sélectionné dans la commande en cours.

URL Params :
| Clé | Valeur |
|---|---|
| `bgAction` | `listBareme` |
| `secret` | `<secret — voir la variable Vercel DISCORD_BRIDGE_SECRET>` |
| `tenant` | (optionnel) hôte de l'instance visée, ex. `tops-des-tops-vercel.vercel.app` — omis, l'hôte de la requête est utilisé |
| `top` | `{top}` (optionnel — filtre sur ce Top ; omis, renvoie tous les Tops) |

Réponse `choices` : `[{name, value}]`, ex. `[{"name":"Victoire (+5 pts)","value":5}]` — `value` (un nombre) est ce qu'il faut envoyer dans `points` (action 3.1).

> Le contrat exact attendu par une source d'autocomplétion dynamique dans l'interface BotGhost (3.5 et 3.6) n'est pas documenté publiquement — à vérifier directement dans le command builder. Les actions 3.1 à 3.4 sont le cœur du bot et fonctionnent indépendamment de ça.

---

## 4. Tester, dans cet ordre

1. **`/classement`** en premier — aucune variable, le plus simple à valider. Doit afficher un classement (même à 0 pts).
2. **`/voir-notes`** en te ciblant toi-même (si ton compte Discord est déjà lié à un joueur du Sheet).
3. **`/ajouter-note`** sur toi-même, puis vérifie avec `/voir-notes` que la note apparaît.
4. **`/ajouter-points`** sur toi-même avec un Top qui existe déjà dans le Sheet (orthographe exacte).
5. Si tout marche, teste `cible`/`joueur` sur un autre joueur (dont le compte Discord est lié).

---

## 5. Lier un compte Discord à un joueur (pour référence — géré côté projet, pas par toi)

Chaque joueur qui veut utiliser le bot doit avoir son ID Discord dans la colonne **"Discord ID"** de l'onglet **Players** du Google Sheet (remplie à la main par le gestionnaire du projet). Sans ça, le bot répond : *"Ton compte Discord n'est lié à aucun joueur."*

Pour qu'un joueur récupère son propre ID Discord : Paramètres Discord → Avancés → activer **Mode développeur** → clic droit sur son propre nom/avatar → **Copier l'ID utilisateur**.

---

## 6. Dépannage

| Symptôme | Cause probable |
|---|---|
| `Test Request` dans BotGhost affiche `status: 302` | L'URL du bloc pointe encore vers une Web App Apps Script (`script.google.com`) : la remplacer par l'adresse Vercel de l'instance. |
| `{"ok":false,"message":"Non autorisé."}` | Le paramètre `secret` est manquant, ne correspond pas à la variable Vercel `DISCORD_BRIDGE_SECRET`, ou cette variable n'est tout simplement pas posée sur le projet Vercel — le message est volontairement identique dans les trois cas, pour ne rien révéler à qui l'obtiendrait sans y avoir droit. Vérifie la valeur dans les variables d'environnement du projet Vercel et recopie-la dans le bloc BotGhost concerné. |
| Une commande renvoie une erreur liée au Sheet (lecture/écriture impossible) | Vérifie que le classeur Google Sheet visé est bien partagé en **Éditeur** avec le compte de service utilisé par le backend — un partage en lecture seule (ou l'absence de partage) bloque toute écriture. |
| `"Ton compte Discord n'est lié à aucun joueur."` | L'ID Discord de la personne n'est pas (ou mal) renseigné dans la colonne Discord ID de Players |
| `"Top inconnu : '...'"` | Faute de frappe dans le nom du Top, ou Top absent du Sheet — vérifie l'orthographe exacte dans l'onglet Categories |
| `"Les points doivent être un entier ≥ 1."` | Valeur de `points` vide, non numérique, à 0 ou négative |
| Rien ne se passe dans Discord après la commande | Le bloc "Send an API Request" a fonctionné mais le bloc **Send Message** juste après est absent ou mal configuré |
