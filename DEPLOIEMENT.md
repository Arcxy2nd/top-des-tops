# Déploiement

Depuis la v3.35.0 (2026-09-21), les deux instances (« Site tops » et « Tops RDS ») sont servies par **Vercel**. Google Apps Script n'est plus utilisé pour servir l'application.

## Déployer

Après avoir poussé sur `main` :

```bash
vercel deploy --prod --yes --scope troispiliers
```

Un seul déploiement met à jour les deux instances. `push.bat` enchaîne commit, push et déploiement. Le dépôt GitHub n'est **pas** relié au projet Vercel et ne doit jamais l'être : un push seul ne déploie rien.

`.vercelignore` limite l'envoi au code servi (`api/`, `lib/`, `Code.gs`, `AutoPoints.gs`, `DiscordBridge.gs`, `Index.html`, `tenants.json`…).

## Instances

| Instance | Hôte Vercel | Lien court |
|---|---|---|
| Site tops | `tops-site-tops.vercel.app` | `c55zvj.s.gy/tops-des-tops` |
| Tops RDS | `tops-rds.vercel.app` | `c55zvj.s.gy/top-RDS` |
| Copie de test | `tops-des-tops-vercel.vercel.app` | — |

`tenants.json` associe chaque hôte à son classeur Google Sheets (et épingle l'`instanceId` qui préfixe le stockage local). Ajouter une instance : ajouter un domaine au projet Vercel, une entrée dans `tenants.json`, et partager le classeur en **Éditeur** au compte de service `tops-des-tops@trois-487801.iam.gserviceaccount.com`.

## Variables d'environnement (Vercel, production)

- `GOOGLE_SERVICE_ACCOUNT_KEY` — clé JSON du compte de service.
- `DISCORD_BRIDGE_SECRET` — secret partagé avec BotGhost (`/api/discord`).
- `CRON_SECRET` — protège la tâche planifiée des points automatiques.
- `TDT_READ_ONLY=1` — **arrêt d'urgence** : toute écriture est refusée. `printf '1' | vercel env add TDT_READ_ONLY production --scope troispiliers`, puis redéployer ; `vercel env rm TDT_READ_ONLY production --yes --scope troispiliers` pour rouvrir.

## Liens courts et retour arrière

Les liens courts short.io sont le commutateur. Ils se déplacent avec le workflow GitHub Actions **« Repoint short links »** (`.github/workflows/repoint-shortlinks.yml`, lancement manuel ; la clé short.io est dans les secrets GitHub) :

```bash
gh workflow run repoint-shortlinks.yml -f site_tops_url=<url> -f tops_rds_url=<url>
```

Sans paramètres, il pointe vers les hôtes Vercel. **Retour arrière vers Apps Script** : le relancer avec les URL `/exec` notées dans `NEXT_SESSION.md` — tant que les déploiements Web App Apps Script existent encore côté Google.
