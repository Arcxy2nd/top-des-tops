# Interface mobile dédiée (fichier séparé, sans duplication du menu)

## Contexte

Une première itération mobile existe déjà ([2026-07-05-mobile-interface-design.md](2026-07-05-mobile-interface-design.md)) : un même fichier `Index.html`, avec un attribut `body[data-mode="mobile"|"desktop"]` qui change l'apparence via CSS, plus un registre `NAV_PAGES` en JS qui génère la barre de navigation desktop et le drawer mobile.

Cette itération va plus loin : au lieu de réutiliser la mise en page desktop redimensionnée, le mobile doit avoir sa propre interface, pensée et stylée pour le tactile, tout en couvrant les 7 mêmes onglets. Contrainte forte du propriétaire du projet : **pas d'explosion du nombre de fichiers**. Le projet compte aujourd'hui `Code.gs`, `AutoPoints.gs`, `Index.html` (+ `appsscript.json`, non fonctionnel) ; un seul fichier est ajouté : `Mobile.html`.

## Objectif

- Une interface mobile complète et redessinée (les 7 onglets), fichier séparé de `Index.html`.
- Aucune donnée de menu ("quels onglets existent, dans quel ordre, avec quelle icône") codée en dur dans les deux fichiers HTML — une seule source, pour que l'ajout/suppression d'un onglet futur ne demande qu'une seule modification.
- Choix automatique de la version (mobile/PC) à l'ouverture du lien, avec bascule manuelle mémorisée.
- Total : 4 fichiers de code dans le projet (`Code.gs`, `AutoPoints.gs`, `Index.html`, `Mobile.html`).

## Décisions

### 1. Le registre de menu devient une donnée serveur, pas une constante JS dupliquée

Aujourd'hui `NAV_PAGES` est un tableau JS codé en dur dans `Index.html` (ligne ~8937). Il déménage dans `Code.gs`, à côté des autres constantes de configuration (à proximité de `ConfigService`), sous la forme d'une constante `NAV_PAGES` **côté serveur**, exposée par une nouvelle fonction `apiGetNavPages()` :

```js
const NAV_PAGES = [
  { id: 'tab-dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'tab-inject',    icon: '✍️', label: 'Saisir un Lot' },
  { id: 'tab-settings',  icon: '⚙️', label: 'Paramètres' },
  { id: 'tab-notes',     icon: '📝', label: 'Notes', countId: 'notesCount' },
  { id: 'tab-history',   icon: '📜', label: 'Historique', countId: 'historyCount' },
  { id: 'tab-outils',    icon: '🔧', label: 'Outils' },
  { id: 'tab-guide',     icon: '❓', label: 'Guide' },
];
function apiGetNavPages() { return { success: true, pages: NAV_PAGES }; }
```

(Le tableau actuel dans `Index.html` oublie l'onglet 🔧 Outils, qui existe pourtant dans l'app — cette migration corrige l'oubli au passage.)

- `Index.html` et `Mobile.html` appellent tous les deux `callServer('apiGetNavPages', ...)` au chargement (même pattern déjà utilisé pour charger joueurs/catégories via `loadEntities`), au lieu de lire une constante locale.
- Ajouter, retirer ou réordonner un onglet à l'avenir = une seule modification dans `Code.gs`. Les deux interfaces se mettent à jour sans y toucher (à l'exception, évidemment, du contenu HTML propre au nouvel onglet, qui doit être écrit dans chaque fichier — seul le **menu** est partagé, pas le contenu des pages).
- Les sous-onglets de Paramètres (Joueurs/Catégories/Barème/Presets/Outils) restent hors registre, comme dans la première itération — liste fixe, rarement modifiée, un simple restyle CSS suffit côté mobile.

### 2. Sélection automatique de version + bascule manuelle mémorisée

`Code.gs` : `doGet(e)` change de comportement :

- Si `e.parameter.view` vaut `'mobile'` → sert `Mobile.html`.
- Si `e.parameter.view` vaut `'desktop'` → sert `Index.html`.
- Sinon (première visite, aucun paramètre) → sert une micro-page de redirection générée directement en JS dans `Code.gs` (quelques lignes, pas besoin d'un fichier séparé) : elle regarde d'abord si un choix est mémorisé dans le navigateur (`localStorage`, clé `tdt_view_pref`) ; sinon elle mesure la largeur d'écran (`matchMedia('(max-width:640px)')`) ; puis elle recharge la page avec `?view=mobile` ou `?view=desktop`.

Dans chaque interface, le bouton bascule 📱/🖥️ (déjà existant) est modifié pour : écrire le choix dans `localStorage` (`tdt_view_pref`), puis recharger la page sur l'autre `?view=`. Le choix manuel est donc permanent jusqu'à ce que l'utilisateur le change à nouveau ; il n'y a pas de retour automatique à la détection tant qu'un choix explicite existe.

### 3. `Mobile.html` — structure et style

- Fichier autonome, avec son propre `<style>` : mise en page verticale, zones tactiles larges, navigation par drawer/barre du bas (à définir en détail lors du plan d'implémentation).
- Les couleurs des joueurs et des catégories (issues des feuilles `Players`/`Categories`, déjà dynamiques côté serveur) restent utilisées telles quelles — c'est une **donnée**, jamais codée en dur, donc naturellement déjà DRY par construction.
- Réutilise les mêmes fonctions `api*` du backend (`Code.gs`) que `Index.html` — aucune nouvelle route serveur nécessaire, à l'exception de `apiGetNavPages()`.
- Petites fonctions utilitaires clientes (l'équivalent de `callServer`, `showToast`, `startBtnLoading`) sont dupliquées telles quelles dans `Mobile.html` : ce sont quelques dizaines de lignes de plomberie technique stable, pas des « menus/boutons » métier, et Apps Script ne permet pas de partager du JS entre fichiers HTML sans ajouter un fichier — ce qui est explicitement exclu ici. Ce n'est pas la duplication que la contrainte DRY visait (le menu, les listes de joueurs/catégories/actions) ; c'est un compromis assumé pour respecter la limite de fichiers.

### 4. Couverture des 7 onglets

Chaque onglet existant est reproduit dans `Mobile.html`, adapté au tactile :

| Onglet | Traitement mobile |
|---|---|
| 📊 Dashboard | Filtres en accordéon, un graphique à la fois, card Commentaires en premier |
| ✍️ Saisir un Lot | Formulaire vertical, un champ par ligne, gros boutons |
| ⚙️ Paramètres | Sous-onglets en liste déroulante ou scroll horizontal |
| 📝 Notes | Priorité n°1 : saisie rapide en un geste, déjà le cas d'usage mobile principal |
| 📜 Historique | Rendu en cartes (une par entrée) plutôt qu'un tableau |
| 🔧 Outils | Actions en liste, une par carte |
| ❓ Guide | Contenu texte, accordéon conservé |

Le détail visuel exact de chaque onglet sera précisé dans le plan d'implémentation, onglet par onglet.

## Vérification

- Backend (`Code.gs`) : test unitaire pour `apiGetNavPages()` dans `tests/` (le harnais Node existant charge déjà `Code.gs` en sandbox).
- Frontend : pas de framework de test — validation manuelle : ouverture du lien sur mobile réel/émulateur (redirection auto), bascule manuelle, puis parcours des 7 onglets en mode mobile.
- Aucune régression attendue côté desktop : `Index.html` continue de fonctionner à l'identique, seul son chargement du menu passe d'une constante locale à un appel serveur.

## Hors périmètre

- Refonte des sous-onglets internes de Paramètres au-delà d'un restyle CSS.
- Détection avancée (type d'appareil, orientation) — seule la largeur d'écran sert à la détection automatique initiale.
- Mode hors-ligne / PWA installable — non demandé.
- Partage de code JS via un mécanisme de template Apps Script (`include()`) — écarté pour ne pas ajouter de fichier supplémentaire.
