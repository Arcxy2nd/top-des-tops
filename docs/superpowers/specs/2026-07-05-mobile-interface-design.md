# Design — Interface mobile (mode dédié)

## Problème
Le responsive actuel (media queries ponctuelles à 640px) ne suffit plus. Il faut une vraie organisation mobile (navigation en drawer, contenu réorganisé), pas juste des ajustements CSS, pour toutes les pages existantes et futures.

## Décisions

### 1. Registre de navigation (JS, source unique)
```js
const NAV_PAGES = [
  { id: 'tab-dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'tab-inject',    icon: '✍️', label: 'Saisir un Lot' },
  { id: 'tab-settings',  icon: '⚙️', label: 'Paramètres' },
  { id: 'tab-notes',     icon: '📝', label: 'Notes', countId: 'notesCount' },
  { id: 'tab-history',   icon: '📜', label: 'Historique', countId: 'historyCount' },
  { id: 'tab-guide',     icon: '❓', label: 'Guide' },
];
```
- La barre du haut (desktop, `.nav-btn`) et le drawer mobile sont tous deux générés à partir de `NAV_PAGES`.
- Ajouter une page future = une entrée ici + sa section de contenu HTML. Rien d'autre à modifier dans le code de navigation.
- Les sous-onglets de Paramètres (Joueurs/Catégories/Barème/Presets/Outils, `.settings-nav-btn`/`data-stab`) restent hors registre — traités en CSS seul (voir §4).

### 2. Mode de mise en page = attribut, pas media query
- `body[data-mode="mobile" | "desktop"]`.
- Détection initiale : `matchMedia('(max-width:640px)')` une fois au chargement.
- Persisté en `localStorage` (`tdt_layout_mode`), 3 valeurs : `auto`, `mobile` (forcé), `desktop` (forcé). Un bouton dans le header permet de forcer/débasculer.
- Tout le CSS de mise en page (drawer, empilement, cartes Historique) dépend uniquement de `[data-mode="mobile"]` — pas de `@media` pour la disposition, pour que le forçage manuel fonctionne indépendamment de la largeur réelle de l'écran. Les `@media` existants à 640px sont remplacés/migrés vers cet attribut.

### 3. Header mobile + drawer
- En mode mobile : header réduit à logo + bouton hamburger.
- Le drawer latéral (ouvrable/fermable) contient : la liste des pages (générée depuis `NAV_PAGES`), le sélecteur de thème dark/light, et le sélecteur d'identité ("Qui suis-je").
- En mode desktop : header et nav actuels inchangés.

### 4. Réorganisation du contenu
- Dashboard, Saisir un Lot, Notes, Paramètres : CSS seul sous `[data-mode="mobile"]` (empilement vertical, filtres en accordéon). Sous-onglets Paramètres : re-stylés en CSS (wrap/scroll horizontal), pas de registre JS.
- Historique : seul cas nécessitant du JS — rendu alternatif en "cartes" (une par entrée) réutilisant les données déjà chargées côté client, sans appel serveur supplémentaire.

### 5. Vérification
- Pas de build/framework : test manuel (redimensionnement navigateur + bouton de bascule mobile/desktop).
- Aucun impact backend (`Code.gs`) — le harnais Node existant n'est pas concerné.

## Hors scope
- Refonte des sous-onglets Paramètres au-delà d'un simple restyle CSS.
- Détection avancée (device type, orientation) — seule la largeur d'écran est utilisée pour l'auto-détection.
