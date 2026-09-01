# Rapport d'Audit UX Mobile — Top-des-Tops

> **Date** : 2026-09-02  
> **Périmètre** : Audit exhaustif de l'interface mobile (`Index.html`) sans modification de code.  
> **Méthode** : Analyse statique détaillée des styles CSS, du balisage HTML et de la logique JavaScript, vérification des 8 axes d'investigation et cartographie des conflits d'interface.

---

## 📊 Synthèse Globale

| Sévérité | Nombre | Description |
|---|---|---|
| 🔴 **Bloquant** | **6** | Empêche l'usage normal (élément masqué par un autre, tap impossible, conflit de z-index, zoom cassant la mise en page). |
| 🟡 **Gênant** | **17** | Utilisable mais fortement dégradé (cibles tactiles trop petites < 44px, zone morte de responsive, absence de wrap). |
| 🔵 **Cosmétique** | **9** | Lisibilité réduite, densité visuelle excessive ou micro-décalages. |
| **Total** | **32** | Problèmes identifiés et localisés. |

---

## 🗺️ Matrice des Conflits de Z-Index & Superpositions

```
┌────────────────────────────────────────────────────────────────────────┐
│ z-index: 9999  ──► #mobileBottomNav (fixe, 62px)                       │ ◄── OBSTRUE TOUT LE BAS !
│                     .who-am-i-dropdown, .nav-hover-tip,                │
│                     .note-history-popover, .float-pts-badge            │
├────────────────────────────────────────────────────────────────────────┤
│ z-index: 4000  ──► #toastContainer (bottom: 20px)                     │ ◄── COLLISION : sous la bottom nav
├────────────────────────────────────────────────────────────────────────┤
│ z-index: 3000  ──► .modal-backdrop, .export-modal-overlay              │
├────────────────────────────────────────────────────────────────────────┤
│ z-index: 2000  ──► #chatSidePanel (plein écran mobile, inset: 0)       │ ◄── COLLISION : bottom nav au-dessus !
├────────────────────────────────────────────────────────────────────────┤
│ z-index: 1501  ──► .bareme-drawer (bottom sheet, max-height: 85vh)     │ ◄── COLLISION : bottom nav au-dessus !
│ z-index: 1500  ──► .bareme-backdrop                                    │
├────────────────────────────────────────────────────────────────────────┤
│ z-index:  500  ──► .nav-chat-btn (FAB mobile, bottom: 70px)            │
├────────────────────────────────────────────────────────────────────────┤
│ z-index:  100  ──► .navbar (sticky top)                                │
├────────────────────────────────────────────────────────────────────────┤
│ z-index:   50  ──► #lotSummaryBar (sticky bottom: 14px)                │ ◄── COLLISION : masqué par bottom nav
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Inventaire Détaillé des Problèmes par Composant

### 1. Navigation, Barres & Système de Layout (Axes 1, 7)

#### 🔴 #01 — Conflit de Z-Index : La Bottom Nav (9999) obstrue le Tchat, le Barème et les Toasts
* **Localisation** : `Index.html` (L329-337, L1268, L1658-1674, L3929)
* **Sélecteurs** : `.mobile-bottom-nav`, `.chat-side-panel`, `.bareme-drawer`, `#toastContainer`
* **Sévérité** : 🔴 **Bloquant**
* **Constat** : 
  - La barre de navigation inférieure a `z-index: 9999`.
  - Quand le Tchat plein écran (`z-index: 2000`) s'ouvre, la bottom nav reste visible par-dessus le panneau et couvre la zone de saisie (`.chat-composer`) et le bouton "Envoyer".
  - Quand le Barème s'ouvre en bottom-sheet (`z-index: 1501`), la bottom nav couvre les 62px inférieurs du tiroir.
  - Les notifications `#toastContainer` (`bottom: 20px`, `z-index: 4000`) s'affichent derrière la bottom nav.

#### 🔴 #02 — `#lotSummaryBar` masqué par la Bottom Nav fixe
* **Localisation** : `Index.html` (L2616-2617, L3920-3935)
* **Sélecteurs** : `#lotSummaryBar`, `.mobile-bottom-nav`
* **Sévérité** : 🔴 **Bloquant**
* **Constat** : Dans l'onglet "Saisir un Lot", la barre récapitulative est sticky à `bottom: max(14px, env(safe-area-inset-bottom))`. La bottom nav fixe mesure 62px de haut. `#lotSummaryBar` vient donc se coller à 14px du bas de l'écran, ce qui la cache à 80% derrière la bottom nav.

#### 🟡 #03 — Breakpoints incohérents & Zone morte entre 641px et 767px
* **Localisation** : `Index.html` (L166, L1298, L1658, L1890, L2118, L2631, L2989, L3610, L3733, L3796, L4067)
* **Sélecteurs** : `@media (max-width: 640px)`, `@media (max-width: 680px)`, `@media (max-width: 768px)`
* **Sévérité** : 🟡 **Gênant**
* **Constat** : L'application utilise 3 breakpoints concurrents (`640px`, `680px`, `768px`). Entre 641px et 767px (ex. tablettes portrait, grands smartphones pliables ou fenêtres réduites) :
  - Le Barème reste un panneau latéral droit desktop au lieu d'un bottom-sheet (règle à 640px).
  - La barre flash de Notes reste sur une seule ligne horizontale (règle à 640px).
  - Le podium des phrases cultes ne s'adapte pas (règle à 640px).
  - Le Guide reste en disposition colonnes (règle à 680px).
  - Mais la bottom nav s'active déjà (règle à 768px), créant une interface hybride incohérente.

#### 🟡 #04 — Duplication CSS massive et divergence entre sélecteurs
* **Localisation** : `Index.html` (L1298-1323, L3959-3977, L4067-4101)
* **Sélecteurs** : `@media (max-width: 640px)`, `body.mobile-layout`, `@media (max-width: 768px) body:not(.desktop-layout)`
* **Sévérité** : 🟡 **Gênant**
* **Constat** : Plus de 20 règles CSS sont triplées avec de légères divergences. Par exemple, `.fp-date-row { flex-wrap: wrap; }` et `.chart-controls { gap: 10px 14px; }` sont définis à L1298 (`@media 640px`) et L3963 (`mobile-layout`), mais sont **absents** du bloc auto-detect `@media (max-width: 768px)` (L4067-4101).

#### 🟡 #05 — Conflit du mode forcé `tdt_forced_layout = desktop`
* **Localisation** : `Index.html` (L1298, L1658, L1890, L2631, L2989, L16588-16628)
* **Sélecteurs** : `body.desktop-layout`, `@media (max-width: 640px)`
* **Sévérité** : 🟡 **Gênant**
* **Constat** : Quand l'utilisateur clique sur le bouton de bascule pour forcer le mode PC sur mobile, le JS ajoute `body.desktop-layout`. Cela désactive les règles `body:not(.desktop-layout)`, mais les 10 blocs `@media (max-width: 640px)` restent actifs. L'interface résultante est un mélange cassé où certains blocs sont forcés en mobile et d'autres en desktop.

#### 🟡 #06 — Cibles tactiles sous-dimensionnées dans la Top Bar mobile (36px au lieu de 44px)
* **Localisation** : `Index.html` (L4024-4025, L4049)
* **Sélecteurs** : `body:not(.desktop-layout) .nav-refresh-btn`, `.nav-bareme-btn`, `.theme-toggle`, `.layout-mode-toggle`, `.who-am-i-btn`
* **Sévérité** : 🟡 **Gênant**
* **Constat** : Pour entrer dans la hauteur de 48px de la navbar mobile, tous les boutons de commande sont bridés à `min-width: 36px; min-height: 36px;` (et `.who-am-i-btn` à `36px`). Cela viole le standard WCAG 2.5.5 / 2.5.8 (cible tactile recommandée de 44×44px minimum).

#### 🔵 #07 — Encombrement critique de la Top Bar sur petit écran (320px)
* **Localisation** : `Index.html` (L3989-4063)
* **Sélecteurs** : `body:not(.desktop-layout) .nav-container`
* **Sévérité** : 🔵 **Cosmétique**
* **Constat** : Sur 320px (iPhone SE 1re gén), la top bar tente de caler le logo, le refresh, le barème, le sélecteur d'identité, le switch de thème et le switch de layout. La largeur disponible est de 320px pour ~315px d'éléments cumulés, forçant le nom du joueur (`.who-am-i-name`) à se tronquer à moins de 3 lettres.

#### 🔵 #08 — Labels de la Bottom Nav minuscules (0.65rem ≈ 10.4px)
* **Localisation** : `Index.html` (L3953)
* **Sélecteurs** : `.mobile-bottom-nav .nav-btn-label`
* **Sévérité** : 🔵 **Cosmétique**
* **Constat** : La taille de police de `0.65rem` (~10px) sur les 6 boutons de la barre basse est très difficilement lisible, particulièrement en extérieur ou sur écrans basse résolution.

---

### 2. Formulaires, Entrées & Zoom iOS (Axe 3)

#### 🔴 #09 — Violation WCAG & Zoom parasite iOS sur tous les champs de saisie
* **Localisation** : `Index.html` (L6, L578, L783, L980, L1507, L1698, L1756-1757, L2027, L3530, L3859)
* **Sélecteurs** : `<meta name="viewport">`, `select`, `input`, `textarea`, `.fp-date-field input`, `.custom-pts-in`, `.bareme-search-wrap input`, `.bulk-import-textarea`
* **Sévérité** : 🔴 **Bloquant**
* **Constat** :
  1. `<meta name="viewport">` contient `maximum-scale=1.0, user-scalable=0`, violant le critère WCAG 1.4.4 (Redimensionnement du texte).
  2. Sur iOS Safari 10+, `user-scalable=0` est ignoré lors du focus : dès qu'un champ a `font-size < 16px`, Safari déclenche un auto-zoom irréversible qui décentre le viewport et brise le positionnement fixe des barres.
  3. Or, **absolument tous les champs de l'application** ont une taille inférieure à 16px (`15px` globalement, `0.82rem` ≈ 13.1px pour les dates, `0.85rem` ≈ 13.6px pour la recherche barème, etc.).

---

### 3. Saisie de Lot & Mode Période (Axes 2, 4, 8)

#### 🔴 #10 — Cibles tactiles impraticables du Mini-Calendrier (15px)
* **Localisation** : `Index.html` (L1542-1548, L1538)
* **Sélecteurs** : `.d-cal-day`, `.d-cal-nav`
* **Sévérité** : 🔴 **Bloquant**
* **Constat** : Chaque jour du mini-calendrier de lot a `height: 15px; line-height: 15px; font-size: 0.66rem;`. Avec 15px de hauteur (soit un tiers du minimum tactile de 44px), il est quasiment impossible de sélectionner une date sans cliquer sur le jour du dessus ou du dessous au doigt. Les flèches mois ont `min-height: 18px`.

#### 🟡 #11 — Débordement horizontal forcé en mode Période (`flex-wrap: nowrap !important`)
* **Localisation** : `Index.html` (L997, L1003)
* **Sélecteurs** : `.d-cell`, `.d-period`
* **Sévérité** : 🟡 **Gênant**
* **Constat** : `.d-cell` et `.d-period` appliquent `flex-direction: row !important; flex-wrap: nowrap !important;`. En mode période, la ligne contient la bascule de dates, les deux champs date et le mini-calendrier (`min-width: 250px`). Sur un écran mobile de 320 à 414px, l'ensemble dépasse la largeur de l'écran et déborde sans passer à la ligne.

#### 🟡 #12 — Boutons de points rapides sous-dimensionnés hors tab inject
* **Localisation** : `Index.html` (L796, L988, L1033)
* **Sélecteurs** : `.pts-btn`, `.date-shortcut`
* **Sévérité** : 🟡 **Gênant**
* **Constat** : Les raccourcis de points ont `min-height: 28px` (L1033) et les raccourcis dates du Dashboard ont `min-height: 30px` (L796). Seul `#tab-inject` a reçu un patch local à L3814 (`min-height: var(--tap-min)`), laissant les boutons de points du reste de l'application sous les 30px.

---

### 4. Onglet Notes (Axe 5)

#### 🟡 #13 — Pastilles joueurs de la Flash Bar Notes trop petites (28px)
* **Localisation** : `Index.html` (L1865-1879)
* **Sélecteur** : `.notes-player-chip`
* **Sévérité** : 🟡 **Gênant**
* **Constat** : Les puces de sélection rapide de joueur dans la flash bar mesurent ~28px de haut avec un espacement de 6px. Le ciblage tactile rapide est imprécis.

#### 🟡 #14 — Bouton bascule de date Notes sous-dimensionné (30px)
* **Localisation** : `Index.html` (L1882-1888)
* **Sélecteur** : `.notes-flash-date-toggle`
* **Sévérité** : 🟡 **Gênant**
* **Constat** : Le bouton calendrier de la flash bar a `padding: 5px 8px; font-size: 0.95rem` sans hauteur minimale (~30px effectifs).

#### 🔵 #15 — Filigrane avatar Notes envahissant sur 320-375px
* **Localisation** : `Index.html` (L1857-1863)
* **Sélecteur** : `.notes-flash-avatar-bg`
* **Sévérité** : 🔵 **Cosmétique**
* **Constat** : L'avatar en filigrane a une largeur fixe de `160px`. Sur un écran de 320px à 375px, il occupe près de la moitié du conteneur de saisie et peut perturber la lisibilité du texte tapé selon le contraste du thème.

#### 🔵 #16 — Footer de carte de note surchargé sur écran étroit
* **Localisation** : `Index.html` (L1381-1404, L15471-15501)
* **Sélecteurs** : `.note-footer`, `.note-meta`, `.note-actions`
* **Sévérité** : 🔵 **Cosmétique**
* **Constat** : Le footer combine les métadonnées de modification (avatar + timestamp + bouton historique) et deux boutons d'action avec libellés complets ("✏️ Éditer", "🗑️ Supprimer"). Sur 320-360px, cela force un retour à la ligne multiple qui étire la hauteur de chaque carte.

---

### 5. Tchat Flottant Mobile (Axe 6)

#### 🔴 #17 — Actions de message de Tchat inaccessibles au tactile (Absence de hover)
* **Localisation** : `Index.html` (L2254-2257)
* **Sélecteurs** : `.chat-msg-actions`, `.chat-msg-actions button`
* **Sévérité** : 🔴 **Bloquant**
* **Constat** : Les boutons d'action d'un message (Répondre, Supprimer) ont `opacity: 0` et ne s'affichent que sur `.chat-msg:hover .chat-msg-actions`. Sur écran tactile sans souris, le `:hover` n'existe pas : les actions sont invisibles et ne peuvent pas être déclenchées de manière fiable (ou nécessitent un double-tap aveugle). De plus, ces boutons ont une taille de seulement 20×20px.

#### 🟡 #18 — Absence de défilement fluide tactile sur les messages du Tchat
* **Localisation** : `Index.html` (L2246)
* **Sélecteur** : `.chat-messages`
* **Sévérité** : 🟡 **Gênant**
* **Constat** : `.chat-messages` a `overflow-y: auto`, mais n'a pas `-webkit-overflow-scrolling: touch;`, ce qui peut provoquer un défilement saccadé ou rigide sur les anciennes versions de WebKit / iOS.

---

### 6. Modales, Popovers & Débordements (Axe 4)

#### 🟡 #19 — Grille 2 colonnes des modales écrasée sur mobile
* **Localisation** : `Index.html` (L1217-1220)
* **Sélecteur** : `.modal-box .modal-grid`
* **Sévérité** : 🟡 **Gênant**
* **Constat** : `.modal-grid` applique `grid-template-columns: 1fr 1fr;` sans media query mobile pour repasser en 1 colonne. Sur un écran de 320px (largeur utile de la modale ~256px), chaque colonne ne fait que ~122px de large, écrasant les libellés et les champs de formulaire.

#### 🟡 #20 — Absence de protection `overflow-x: hidden` sur `body`
* **Localisation** : `Index.html` (L86-106)
* **Sélecteur** : `body`
* **Sévérité** : 🟡 **Gênant**
* **Constat** : Le `body` n'a pas de garde `overflow-x: hidden`. Dès qu'un tableau, un graphique ou une animation dépasse de quelques pixels la largeur de la fenêtre, toute la page se met à glisser horizontalement sous le doigt.

#### 🟡 #21 — Chips de filtres globaux trop bas (34px)
* **Localisation** : `Index.html` (L740, L1304, L3964)
* **Sélecteur** : `.fchip`
* **Sévérité** : 🟡 **Gênant**
* **Constat** : Les puces de filtrage ont `min-height: 34px`, et sur mobile leur padding est réduit à `4px 10px` avec `font-size: 0.78rem`, donnant une hauteur tactile réelle de ~28-30px.

---

### 7. Dashboard & Graphiques Chart.js (Axe 8)

#### 🟡 #22 — Tooltip personnalisé Chart.js bloqué à l'écran sur mobile (Absence de dismiss tactile)
* **Localisation** : `Index.html` (L16683-16694)
* **Sélecteur** : `document.addEventListener('mousemove', ...)`
* **Sévérité** : 🟡 **Gênant**
* **Constat** : La fermeture de `#chartCustomTooltip` repose exclusivement sur les événements de souris (`mousemove`, `mouseleave`). Au toucher sur mobile, une fois qu'un point du graphique a été touché, la bulle d'infobulle reste affichée indéfiniment au-dessus du graphique, même si l'utilisateur touche ailleurs ou fait défiler la page.

#### 🟡 #23 — Risque de troncature gauche du Tooltip Chart.js sur mobile
* **Localisation** : `Index.html` (L10800-10810)
* **Sélecteur** : `buildCustomTooltipPlugin`
* **Sévérité** : 🟡 **Gênant**
* **Constat** : Le positionnement calcule `if (x + elW > wRect.width - 8) x = cRect.left - wRect.left + tooltip.caretX - elW - 14;`. Si l'élément est proche du bord droit sur un petit écran de 300px, le décalage à gauche peut produire `x < 0`. Contrairement à `y` qui est borné (`if (y < 0) y = 4;`), `x` n'est pas borné et le tooltip peut être coupé à gauche.

---

### 8. Barème & Tiroir Bottom-Sheet (Axes 4, 8)

#### 🟡 #24 — Champs d'ajout rapide au Barème trop petits
* **Localisation** : `Index.html` (L1756-1757)
* **Sélecteurs** : `.bsect-add input[type="number"]`, `.bsect-add input[type="text"]`
* **Sévérité** : 🟡 **Gênant**
* **Constat** : Les inputs de saisie dans le barème ont des font-sizes de `0.82rem` et `0.84rem` (~13px) et un padding réduit de `5px`, rendant la frappe difficile et déclenchant le zoom iOS.

---

### 9. Paramètres, Historique & Outils (Axe 8)

#### 🟡 #25 — Boutons de pagination sous-dimensionnés (36px)
* **Localisation** : `Index.html` (L1063)
* **Sélecteur** : `.pagination button`
* **Sévérité** : 🟡 **Gênant**
* **Constat** : Les boutons de changement de page dans l'historique ont `min-width: 36px; padding: 6px;` au lieu de 44px.

#### 🟡 #26 — Bouton "Copier la phrase" de repli minuscule (24px)
* **Localisation** : `Index.html` (L3638)
* **Sélecteur** : `.phrase-fallback-copy`
* **Sévérité** : 🟡 **Gênant**
* **Constat** : Le bouton de copie dans l'éditeur de phrases a `min-height: 24px; padding: 3px 7px; font-size: 0.7rem;`.

#### 🔵 #27 — Sous-onglets Paramètres très denses sur 320px
* **Localisation** : `Index.html` (L3654, L3734)
* **Sélecteur** : `.settings-nav-btn`
* **Sévérité** : 🔵 **Cosmétique**
* **Constat** : 6 sous-onglets avec `min-width: 72px; padding: 9px 5px; font-size: 0.75rem;` forment 2 à 3 lignes inégales selon la largeur exacte du smartphone.

#### 🔵 #28 — Sous-onglets Historique compacts
* **Localisation** : `Index.html` (L3743-3755, L3797)
* **Sélecteur** : `.history-nav-btn`
* **Sévérité** : 🔵 **Cosmétique**
* **Constat** : Les boutons ont `padding: 9px 5px; font-size: 0.75rem;` sur mobile.

---

### 10. Podium & Feed des Phrases Cultes (Axe 8)

#### 🔵 #29 — Étroitesse critique des colonnes du Podium sur 320px
* **Localisation** : `Index.html` (L2989-3011)
* **Sélecteurs** : `.phrases-podium`, `.podium-column`, `.phrase-podium-card`
* **Sévérité** : 🔵 **Cosmétique**
* **Constat** : Sur 320px, chaque colonne du podium ne dispose que de ~95px de largeur. Le texte des citations se retrouve tronqué à 1-2 mots par ligne, étirant fortement la hauteur du podium.

---

### 11. Bannière CTA Mobile (Axe 7)

#### 🔵 #30 — Bannière CTA jamais affichée si l'auto-détection JS réussit
* **Localisation** : `Index.html` (L3900-3902, L16639)
* **Sélecteurs** : `.mobile-cta-banner`, `initMobileCtaBanner`
* **Sévérité** : 🔵 **Cosmétique**
* **Constat** : La règle CSS L3901 cible `:not(.mobile-layout)`. Dès que le JS s'exécute sous 768px, il applique immédiatement `body.mobile-layout`, ce qui masque instantanément la bannière CTA avant même qu'elle ne s'affiche. Elle ne peut être vue que si le JS échoue ou en mode desktop forcé.

#### 🔵 #31 — Fermeture de la bannière CTA non persistée en localStorage
* **Localisation** : `Index.html` (L16654-16656)
* **Sélecteur** : `closeBtn.addEventListener('click', ...)`
* **Sévérité** : 🔵 **Cosmétique**
* **Constat** : Le clic sur la croix de fermeture ajoute seulement la classe `.banner-dismissed` au `body` sans sauvegarder en localStorage, réaffichant la bannière à chaque rechargement si les conditions sont réunies.

---

### 12. Guide Inline (Axe 1, 8)

#### 🔵 #32 — Seuil de rupture spécifique au Guide (680px)
* **Localisation** : `Index.html` (L2118-2127)
* **Sélecteurs** : `@media (max-width: 680px)`, `.guide-layout`
* **Sévérité** : 🔵 **Cosmétique**
* **Constat** : Le Guide est le seul composant à utiliser un breakpoint à 680px au lieu du standard 768px ou 640px, créant un comportement discordant entre 641px et 680px.

---

## 🎯 Recommandations & Ordre de Priorité pour la Correction

1. **Priorité 1 — Débloquer les superpositions d'interface (🔴 Bloquants)** :
   - Réaligner la hiérarchie des `z-index` : le Tchat plein écran (`z-index: 10000`) et le Barème (`z-index: 10000`) doivent passer au-dessus de la bottom nav (`z-index: 9000`).
   - Repositionner `#toastContainer` à `bottom: calc(70px + env(safe-area-inset-bottom))` pour flotter au-dessus de la barre de navigation.
   - Ajuster `#lotSummaryBar` pour être sticky à `bottom: calc(68px + env(safe-area-inset-bottom))`.
   - Afficher les actions de messages du Tchat en permanence au tactile (`@media (hover: none)`).

2. **Priorité 2 — Accessibilité & Saisie tactile (🔴 Bloquants & 🟡 Gênants)** :
   - Passer la taille de police minimale de **tous les inputs, selects et textareas à 16px** sur mobile pour éliminer l'auto-zoom destructeur d'iOS Safari.
   - Supprimer `maximum-scale=1.0, user-scalable=0` du `<meta name="viewport">`.
   - Augmenter la taille des cellules du mini-calendrier de lot de 15px à une cible tactile praticable (ou mode sélecteur natif au toucher).
   - Autoriser le retour à la ligne (`flex-wrap: wrap`) sur `.d-period` et `.d-cell` en mode période sur mobile.

3. **Priorité 3 — Harmonisation du Responsive & Breakpoints (🟡 Gênants)** :
   - Unifier l'ensemble des règles mobiles sous un **seul breakpoint standard : `@media (max-width: 768px)`**.
   - Supprimer les doublons CSS entre `@media 640px` et `body.mobile-layout`.
   - Établir `min-height: 44px` / `min-width: 44px` sur tous les boutons interactifs (top bar, puces filtres, raccourcis points, pagination).
   - Ajouter `body { overflow-x: hidden; }` pour bloquer les glissements de page involontaires.
   - Ajouter un écouteur `touchstart` / `click` hors canvas pour fermer l'infobulle Chart.js sur mobile.
