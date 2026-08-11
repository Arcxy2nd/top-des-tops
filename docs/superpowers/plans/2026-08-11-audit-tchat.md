# Passe 6 — 💬 Tchat flottant

> Protocole : [`2026-08-11-audit-onglet-par-onglet.md`](2026-08-11-audit-onglet-par-onglet.md). Les contraintes globales de ce document s'appliquent à toutes les tâches ci-dessous.

**État :** ✅ passe livrée en v3.13.0 — commit **local uniquement, non poussé**. Touche `SettingsService.renameEntity()` (cascade vers Chat) → garde-fou n°3 du plan-cadre : confirmation utilisateur requise avant `git push`. `npm run verify` vert à 169 tests.
**Ligne de base :** v3.12.0 (passe 5), 160 tests verts.

---

## Carte — phase 1

### Structure de la cible

Pas un onglet du système de tabs (`#tab-*`) — un widget global superposé, hors du flux `goToTab()`. Depuis un refactor antérieur à cette passe (CHANGELOG:423, « remplacement du widget tchat flottant par `#chatSidePanel` et du bouton `#chatToggleBtn` dans la Top Bar »), ce n'est plus un bouton flottant draggable mais :
- Un bouton dans la barre de navigation desktop : `#chatToggleBtn` (Index.html:4122), classe `.nav-chat-btn`, badge de messages non lus `#chatBadge`.
- Un panneau latéral ancré (`sticky`) à droite du contenu principal : `#chatSidePanel` (Index.html:4188-4204), classe `.chat-side-panel` — en-tête, liste de messages `#chatMessages`, bandeau de réponse `#chatReplyBanner`, zone de saisie `#chatInput` + `#chatSendBtn`.

**Écart avec `context.md` §5 confirmé — description obsolète, pas un défaut de code :** `context.md` décrit encore « le bouton se déplace par glisser (clic/tap maintenu), position mémorisée en localStorage ; un clic simple ouvre/ferme le panneau ». Ce comportement n'existe plus dans le code actuel — aucun listener `mousedown`/`dragstart` sur `#chatToggleBtn`, et la constante `CHAT_FAB_POS_KEY = 'tdt_chat_fab_pos'` (Index.html:7428) n'est ni lue ni écrite nulle part (confirmé par grep sur tout le fichier). À corriger dans `context.md` en phase 5 (documentation, hors périmètre de code) plutôt que dans le comportement du widget lui-même.

### CSS — vivant et mort

Règles actives : `.nav-chat-btn`/`.nav-chat-btn:hover`/`.nav-chat-btn.active` (Index.html:228-251), `.chat-badge` (252-260), `.chat-side-panel` + layout desktop (262-298), puis le bloc `.chat-messages`/`.chat-msg*`/`.chat-reply-banner`/`.chat-composer`/`.chat-empty` (2199-2233).

**Code mort confirmé (axe 5), vestige du widget flottant pré-refactor :**
- `.chat-fab` + `.chat-fab:active` (Index.html:2176-2183) — jamais référencé en HTML/JS (grep confirmé).
- `.chat-fab-badge` (2184-2188) — idem.
- `.chat-panel` (2189-2194) — idem (à ne pas confondre avec `.chat-panel-header`, actif, ou `.chat-side-panel`, actif).
- `CHAT_FAB_POS_KEY` (Index.html:7428) — constante JS jamais utilisée.

### Visibilité mobile — à vérifier en phase 2, indice fort de régression totale

```css
/* Sur tous les layouts non-desktop : panneau invisible (pas de FAB dans le DOM) */
body:not(.desktop-layout) .chat-side-panel { display: none !important; }
/* Bouton chat navbar : masqué hors desktop (le panel n'existe pas en mobile) */
body:not(.desktop-layout) .nav-chat-btn { display: none !important; }
```
(Index.html:292-298, commentaires d'origine inclus). Le commentaire admet lui-même l'absence de remplacement mobile. Depuis la suppression de `Mobile.html` (commit `08938f5`, retour à `Index.html` responsive unique) qui portait l'ancien `#mChatFab`, **aucun mécanisme d'accès au Tchat ne semble subsister hors du layout desktop** — à confirmer par la sonde (resize mobile + lecture DOM), car si vrai, c'est une régression totale de fonctionnalité sur mobile, pas une simple gêne d'ergonomie.

### JS frontend — fonctions principales (Index.html:7419-7691)

| Fonction | Ligne | Rôle |
|---|---|---|
| `formatChatTime(iso)` | 7430 | formatte l'heure courte + titre complet d'un message |
| `chatSnippet(text, len)` | 7439 | tronque un texte pour l'aperçu de réponse |
| `buildChatMessageEl(msg)` | 7444 | construit le DOM d'un message (avatar, auteur, heure, actions répondre/supprimer, citation, corps markdown) |
| `renderChatMessages(forceScroll)` | 7529 | (re)rend la liste complète (confirmés + envois optimistes en attente) |
| `setChatReplyTo(msg)` / `clearChatReplyTo()` | 7542 / 7550 | bandeau « Répondre à » |
| `updateChatBadge()` | 7555 | affiche/masque le badge de non-lus |
| `openChatPanel()` / `closeChatPanel()` / `toggleChatPanel()` | 7566 / 7578 / 7587 | ouverture/fermeture du panneau, reset du compteur non-lu, (re)chargement |
| `initChatWidget()` | 7591 | câblage des écouteurs (bouton toggle, fermer, envoyer, Entrée, annuler réponse, scroll, autocomplétion mention, auto-grandissement textarea) |
| `loadChat()` | 7610 | chargement initial complet |
| `scheduleChatPoll()` | 7622 | sondage adaptatif : 4s panneau ouvert / 20s fermé / pause si onglet masqué (`visibilitychange`) |
| `pollChat()` | 7638 | sondage — anti-chevauchement (`_chatPollInFlight`), détecte changement par longueur + dernier id |
| `sendChatMessage()` | 7661 | envoi optimiste (message `pending` immédiat, grisé, retiré/restauré si échec) |

Écouteurs câblés dans `initChatWidget()` — pas de trace d'un appel séparé ailleurs ; à confirmer que `initChatWidget()` est bien appelée au chargement (phase 2).

### Backend — `Code.gs` (ChatService, lignes 1481-1580)

| Fonction | Ligne | Rôle |
|---|---|---|
| `_sheet()` | 1488 | feuille `Chat`, auto-création (`Id\|Date\|Auteur\|Texte\|RéponseÀ`) si absente |
| `getAllMessages()` | 1502 | lit toutes les lignes, résout `replyToAuthor`/`replyToText`/`replyToDeleted` **côté serveur** (survit à la suppression de l'original), cache `chat_msgs_v<version>`, tronque aux `MAX_MESSAGES` (500) plus récents |
| `postMessage(author, text, replyToId)` | 1548 | valide auteur/texte non vide/longueur ≤ 2000, append, bump version |
| `deleteMessage(id, author)` | 1563 | supprime uniquement si `author` correspond à l'auteur de la ligne, bump version |

Endpoints `api*` (Code.gs:2856-2891) : `apiGetChatMessages()`, `apiPostChatMessage(text, replyToId, author)`, `apiDeleteChatMessage(id, author)` — tous deux mutateurs passent par `requireAuthor()` + `withLock()` + `AuditService.log()` avec snapshot (`op: 'insert'`/`'delete'`, `sheet: 'chat'`) → **identité + journal confirmés conformes aux règles maison**, snapshot compatible avec le mécanisme générique d'annulation (`AuditService.undo` reconnaît la clé `chat` via `ConfigService.getSheets().chat`, confirmé).

### Écart de cascade `renameEntity`/`deleteEntity` — même famille que passes 4/5

`SettingsService.renameEntity()` (Code.gs:465-525) cascade vers `History`, `AutoRules`, et (depuis la passe 5) `Notes` pour un renommage de Joueur — **mais jamais vers `Chat`** (confirmé à la lecture : aucune référence à `ConfigService.getSheets().chat` dans `renameEntity`/`_renameInColumn`/`deleteEntity`). Un Joueur renommé garde ses anciens messages tchat attribués à l'ancien nom : `buildChatMessageEl` ne le retrouve plus dans `cachedPlayers` (avatar générique, couleur de repli), et surtout `msg.author === _whoAmI` (Index.html:7482) ne matche plus après renommage — **l'auteur perd la possibilité de supprimer ses propres anciens messages**. Troisième feuille dérivée trouvée avec ce trou (après Bareme/Phrases/AutoRules en passe 4, Notes corrigée en passe 5) — cohérent avec la leçon de passe 4/5 : « le même défaut de fond se découvre feuille par feuille ». Touche `renameEntity` → **garde-fou n°3** : toute correction ici s'arrête avant push pour confirmation utilisateur explicite.

### Tests existants couvrant la zone

**Aucun fichier de test dédié.** `tests/frontend/fixtures.js:67` fournit une feuille `chat` avec un message pré-seedé (`Ilker → Salut @Safir`), mais aucun test Node n'exerce `ChatService`/`apiGetChatMessages`/`apiPostChatMessage`/`apiDeleteChatMessage` — seule mention dans `tests/settings.test.js:11`, un commentaire, pas un test. Trou de couverture réel (axe 5), sur une zone qui mute des données (identité + journal) sans filet de test.

### Historique — CHANGELOG.md

Zone avec un historique dense (au moins 8 entrées) :
- Refactor fondateur : bouton flottant draggable → `#chatSidePanel`/`#chatToggleBtn` ancrés (CHANGELOG:423).
- Ancrage du panneau recalé à chaque message pour ne pas déborder de l'écran (CHANGELOG:680-681).
- Entrée qui envoyait au lieu d'insérer une mention en cours de sélection — corrigé, `attachMentionAutocomplete` enregistrée avant l'écouteur d'envoi (CHANGELOG:692-693).
- Auto-grandissement du textarea de saisie (CHANGELOG:712-713).
- Réactivité : envoi optimiste + sondage adaptatif 2s/8s (texte) — **actuellement en code 4s/20s** (Index.html:7625) : soit le CHANGELOG:716-717 décrit un intervalle différent de celui en place, soit régressé depuis — à vérifier en phase 3/4, incohérence potentielle documentation/code sur un axe déjà signalé sensible par les passes précédentes.
- Identité obligatoire ajoutée sur la suppression de message (CHANGELOG:746-747) — confirmée toujours en place à la lecture actuelle (`requireIdentity()` avant `openConfirmModal`, Index.html:7487).
- Popup d'autocomplétion `@`/`#` invisible en bas d'écran (widget flottant bas d'écran d'alors) — bascule au-dessus si pas de place en dessous (CHANGELOG:756-757), logique partagée par tous les champs, donc toujours active indépendamment du refactor de positionnement du panneau.

**Point à surveiller en priorité (axe 1 + axe 5) :** l'écart 4s/20s (code) vs 2s/8s (CHANGELOG) sur le sondage — vérifier lequel est réel et si le CHANGELOG a menti dès l'origine ou si une régression silencieuse a changé l'intervalle depuis.

---

## Relevés — phase 2

`npm run verify` : 160/160 verts avant sonde. `preview_start top-des-tops-frontend`, chargement initial : 0 erreur (`window.__frontErrors` vide, hors `ERR_NAME_NOT_RESOLVED` sur les avatars de fixtures — attendu, `example.invalid`).

### R1 — Tchat totalement inaccessible en `mobile-layout`, y compris par régression desktop (CONFIRMÉ, très sévère)

Reproduit à froid, deux façons :
1. **Mobile réel** — chargement à 375px (`resize_window` preset mobile + reload) : `document.body.className === 'mobile-layout'`. Aucun bouton, aucune icône, aucune entrée de menu pour le Tchat nulle part dans le DOM (les 6 boutons de nav Dashboard/Saisir un Lot/Notes/Historique/Paramètres/Guide sont les seuls éléments interactifs de la nav). Confirmé en CSS : `body:not(.desktop-layout) .chat-side-panel { display: none !important; }` et `body:not(.desktop-layout) .nav-chat-btn { display: none !important; }` (Index.html:292-298) — le commentaire du code lui-même l'admet (« panneau invisible, pas de FAB dans le DOM »), sans aucun mécanisme de repli mobile derrière. Cohérent avec la Carte : le widget flottant mobile (`#mChatFab` de l'ex-`Mobile.html`) a disparu avec la fusion en fichier unique responsive (commit `08938f5`) et n'a jamais été reconstruit pour le nouveau layout partagé.
2. **Desktop qui régresse sans jamais s'en remettre** — chargement à 375px (→ `mobile-layout`, comme ci-dessus) puis `resize_window` vers desktop **sans recharger la page** : `innerWidth` passe à 1280 mais `document.body.className` reste `mobile-layout` indéfiniment — `initLayoutModeToggle()` (Index.html:15933-15973) ne s'exécute qu'une fois au chargement (`applyLayout(initialMobile)`), aucun écouteur `resize`/`matchMedia.addEventListener` ne réévalue la disposition ensuite. Un utilisateur qui agrandit une fenêtre initialement étroite (dock vers un second écran, sortie du mode réduit, tablette qui change d'orientation avec la page déjà chargée) reste bloqué en disposition mobile — et donc **sans accès au Tchat** — jusqu'à un rechargement complet de la page.

Sévérité : fonctionnalité entière rendue injoignable pour une classe d'utilisateurs (mobile) et un scénario courant côté desktop (redimensionnement fenêtre), sans aucun message ni indice à l'écran expliquant pourquoi.

**Observation liée (non testable indépendamment tant que R1 n'est pas corrigé) :** les actions « Répondre »/« Supprimer » d'un message (`.chat-msg-actions`) ne s'affichent qu'au survol (`opacity:0` par défaut, `:hover{opacity:1}`, Index.html:2207-2208) — inutilisables au tactile (pas de `:hover` sur un écran tactile). Si l'accès mobile est un jour rétabli, ce point devra être revu en même temps, sans quoi le correctif de R1 livrerait un Tchat mobile où personne ne peut répondre ni supprimer son propre message.

### R2 — Citation de réponse figée sur le contenu d'un message pourtant supprimé, jusqu'à rechargement complet de la page (CONFIRMÉ, sévère)

Reproduit : message A envoyé (« Message A a supprimer »), message B envoyé en réponse à A (citation affichée correctement : `<div class="chat-msg-reply"><strong>Safir</strong><span>Message A a supprimer</span></div>`), puis A supprimé via le bouton 🗑️ + confirmation. Résultat immédiat : A disparaît bien du DOM, **mais la citation dans B garde exactement l'ancien contenu d'A** au lieu de basculer sur « Message supprimé » (`.chat-msg-reply.deleted`). Persiste après fermeture/réouverture du panneau (qui déclenche `pollChat()`) — seul un rechargement complet de la page (`loadChat()` frais) corrige l'affichage, confirmant que **la donnée serveur est correcte** (`replyToDeleted` bien recalculé par `ChatService.getAllMessages()`, Code.gs:1535-1541) et que le défaut est **purement côté client**.

Cause : `apiDeleteChatMessage` (Index.html:7490-7493) filtre juste le message supprimé de `_chatMessages` en local et rappelle `renderChatMessages(false)`, sans jamais rappeler `loadChat()`. Et `pollChat()` (Index.html:7638-7657) ne détecte un changement que si `fresh.length !== _chatMessages.length` ou si le dernier id diffère — après une suppression, le nombre de messages du client est déjà retombé au même total que le serveur (puisque le client a lui-même retiré le message localement), donc `changed` reste `false` et le contenu périmé des citations des AUTRES messages n'est jamais rafraîchi, même indéfiniment.

Conséquence pour l'utilisateur : une citation affiche un auteur et un texte qui n'existent plus nulle part, sans aucune indication qu'elle est obsolète — trompeur (axe 2, « Ça dit vrai »). Cliquer sur la citation (`scrollIntoView` vers `#chat-msg-<replyToId>`) ne fait rien de visible non plus, puisque la cible n'est plus dans le DOM (`if (target)` protège juste contre un crash, Index.html:7509-7515) — clic mort, sans retour.

### R3 — Harness de test local sans mock `Utilities`, bloquant tout envoi de message en sonde et toute écriture de test Node sur le Tchat (CONFIRMÉ, corrigé séance tenante)

Avant tout envoi réel testable, `apiPostChatMessage` échouait systématiquement avec `"Utilities is not defined"` (`ChatService.postMessage`, Code.gs:1555, appelle `Utilities.getUuid()`) — confirmé par appel direct à `/call`. `tests/harness.js` (`gasMocks()`) fournit des simulacres pour `SpreadsheetApp`/`PropertiesService`/`CacheService`/`LockService`/`HtmlService`/`ScriptApp`/`Logger` mais pas pour `Utilities`, alors que c'est le seul appelant de ce global dans tout `ChatService`. Explique aussi, en creux, pourquoi **aucun test Node n'a jamais existé pour `ChatService`** (impossible à écrire sans que `postMessage` lève cette erreur) — trou de couverture confirmé en Carte.

`Session` (utilisé une fois dans `AutoPoints.gs:243`, hors périmètre Tchat) a le même trou — signalé mais **non corrigé ici**, hors scope de cette passe (Paramètres/Outils, déjà livré passe 4) ; à traiter dans une tâche séparée.

**Correctif appliqué immédiatement** (bloquant pour la suite de la sonde, pas un correctif de fond différable) : `tests/harness.js` — ajout de `Utilities: { getUuid: () => crypto.randomUUID() }` à `gasMocks()`. Aucune modification de `Code.gs`/`Index.html`. `npm run verify` toujours vert à 160 tests après coup ; serveur de prévisualisation redémarré pour charger le harness corrigé. Reste à faire en phase 5 : ajouter la couverture de test `ChatService` elle-même (toujours absente), maintenant que le harness le permet.

### Contrôles vérifiés sans défaut

- **Envoi** (une fois le harness corrigé) : message optimiste affiché immédiatement grisé avec horloge, confirmé par le serveur, remplacé par le message définitif avec avatar/couleur/heure corrects.
- **Mention `@joueur`** dans un message envoyé : rendu en pastille colorée avec avatar, cohérent avec le reste de l'app.
- **Autocomplétion `@`** : popup `md-mention-popup` s'ouvre à la frappe, liste les 6 premiers joueurs correspondants (plafond partagé par `attachMentionAutocomplete`, pas spécifique au Tchat — cf. Notes/descriptions), navigation clavier/clic fonctionnelle.
- **Répondre** : bandeau « Répondre à » affiché avec aperçu tronqué, citation correctement jointe au message envoyé, bandeau se ferme après envoi.
- **Suppression de son propre message** : modale de confirmation (générique, « Supprimer ce message ? » — sans aperçu du contenu, à la même limite que la modale de suppression de Note relevée en passe 5, non bloquant), suppression effective, retirée immédiatement du fil.
- **Autorisation serveur indépendante de l'UI** : tentative de suppression du message d'un autre joueur via un appel direct à `apiDeleteChatMessage` (contournant l'UI, qui ne montre déjà pas le bouton) → rejetée côté serveur (« Tu ne peux supprimer que tes propres messages »). Le filtrage visuel n'est pas la seule protection.
- **Identité obligatoire** : `requireIdentity()` confirmé avant l'ouverture de la modale de suppression (lecture code, cohérent avec CHANGELOG:746-747).
- **Repli d'avatar** : les 7 joueurs de fixtures ont une URL d'avatar cassée (`example.invalid`) — tous les avatars du Tchat (messages, autocomplétion) basculent correctement sur `ui-avatars.com`, aucune disparition (contrairement au motif R1/N6-N8 de la passe 5, qui ne concernait pas cette zone).
- **Thème clair/sombre** : bascule testée avec le panneau ouvert et des messages affichés — aucun gel de couleur observé sur le panneau, les bulles ou le texte (bénéficie du mécanisme général `body.theme-switching`, passe 3).
- **Badge de non-lu + sondage** : panneau fermé, message posté par un autre joueur (simulé par appel serveur direct), `pollChat()` déclenché → badge passe à « 1 » ; réouverture du panneau → badge disparaît, nouveau message visible dans le fil.
- **Validation longueur (2000 caractères)** : appliquée côté serveur (`ChatService.postMessage`), remontée via le toast d'erreur générique de `callServer` en cas de dépassement — pas de garde côté client (`<textarea>` sans `maxlength`), mais le message d'erreur reste clair et actionnable.
- **Double-soumission (Entrée/clic Envoyer)** : pas de garde explicite anti-double-clic, mais non exploitable en pratique — `sendChatMessage()` vide `input.value` de façon synchrone avant tout retour serveur, donc un second déclenchement immédiat trouve un champ vide et s'arrête tôt (`if (!text) return`). Différent du motif N3 de Notes (passe 5), pas de défaut ici.

### Point CHANGELOG à vérifier en phase 3/4

`scheduleChatPoll()` actuel (Index.html:7622-7626) : 4s panneau ouvert / 20s fermé. CHANGELOG:716-717 documente « 2 s ouvert / 8 s fermé » pour ce même mécanisme. Écart à trancher : rédaction historique imprécise dès l'origine, ou changement de valeur non documenté depuis — à qualifier en phase 3 (axe 5) plutôt que supposé.

## Clôture phase 2

Sonde terminée. 2 défauts confirmés et sévères (R1 — Tchat inaccessible en mobile-layout et non résilient à un redimensionnement desktop ; R2 — citation de réponse périmée après suppression, jusqu'à reload complet), 1 défaut d'infrastructure de test corrigé séance tenante (R3 — mock `Utilities` manquant, bloquant), 1 observation liée à R1 (actions au survol seul, inutilisables au tactile), 1 point à trancher (intervalle de sondage 4s/20s vs CHANGELOG 2s/8s). Aucune anomalie sur le reste du périmètre testé (envoi, mention, autocomplétion, réponse, suppression, autorisation serveur, identité, avatar, thème, badge/sondage, validation longueur, double-soumission).

## Défauts candidats — phase 3

Conseil à 5 en mode local (relancé une fois suite à une limite de session API — 5/5 rapports reçus au second essai, cohérent avec la Leçon passe 5). Union brute.

**Axe 1 — Ça marche**
- C11. `loadChat()` (Index.html:7610-7616) sans `onError` : si le tout premier chargement échoue, `_chatLoadedOnce` reste `false` et `#chatMessages` reste un `<div>` vide sans aucun indice, jusqu'à fermeture/réouverture du panneau ou détection fortuite d'un changement par le sondage.
- C12. Citation « clic mort » : un message cité plus vieux que les 500 derniers (`MAX_MESSAGES`) s'affiche correctement (pas de « supprimé ») mais son original n'est jamais dans le DOM — le clic sur la citation ne fait rien, sans indice.
- C13. Auto-grandissement du textarea incohérent avec la CSS : `autoGrowTextarea(ta, 0.3)` (Index.html:5693-5706, appelée 7598) calcule son propre plafond (`innerHeight*0.3`, ~216px à 720px d'écran) et pose `overflow-y:hidden` tant que le contenu est sous ce plafond — mais `.chat-composer textarea { max-height: 120px; }` (Index.html:2232) coupe réellement l'affichage à 120px, indépendamment. Sur un message de 5 à 8 lignes (~130-200px de contenu), le texte au-delà de 120px devient invisible sans scrollbar pour le récupérer visuellement.

**Axe 2 — Ça dit vrai**
- C2a. Badge de non-lus peut rater un message : `pollChat()` (Index.html:7638-7657) calcule `newCount = fresh.length - _chatMessages.length` — si un message est ajouté puis supprimé (ou l'inverse) entre deux sondages de façon à ce que la longueur totale reste stable, `newCount` peut valoir 0 alors qu'un message réellement jamais vu est apparu ; le badge (panneau fermé) ne s'incrémente pas.
- C2b. Doublon visuel possible entre le message optimiste en attente et sa version confirmée par le serveur : `renderChatMessages()` (Index.html:7529-7540) concatène `_chatMessages.concat(_chatPendingSends)` sans déduplication ; si `pollChat()` absorbe le message confirmé avant que le callback de succès du `POST` d'origine n'ait retiré l'entrée de `_chatPendingSends`, le message apparaît deux fois brièvement. (Recoupé indépendamment par l'axe 5, C54 — même défaut, même cause.)

**Axe 3 — Règles maison**
- C31. `.chat-badge` (Index.html:253-254) utilise `#ff4757`/`#fff` en dur au lieu de `var(--error)`/`var(--on-accent)` — viole « variables CSS uniquement ». Le sibling mort `.chat-fab-badge` (2184-2188, vestige du widget flottant) utilise, lui, correctement les variables : le badge vivant a divergé du bon patron.
- C32. `.nav-chat-btn` (Index.html:228-246) : fond `rgba(255,255,255,0.05)` en dur au repos, alors que `:hover` bascule correctement sur `var(--btn-alt)`. `--btn-alt` vaut `rgba(0,0,0,0.05)` en thème clair (ligne 71) — le repos en dur reste blanc, quasi invisible sur le fond clair (`--bg` proche du blanc), alors que le survol devient noir : incohérence de traitement de surface entre repos et survol, spécifique au thème clair.
- C33. Avatar manquant à deux endroits du Tchat : la citation d'un message répondu (`<strong>${author}</strong>` sans `<img>`, Index.html:7508) et le bandeau composeur « Répondre à » (`#chatReplyBannerAuthor`, rempli en `.textContent` seul, Index.html:4194-4200/7542-7548) — exception à « avatar sur chaque nom affiché, aucune exception ».

**Axe 4 — Utilisable**
- C4-1. Bouton supprimer un message (🗑️, Index.html:7483-7485) sans la classe `danger` utilisée systématiquement ailleurs dans l'app pour les actions destructrices (9+ occurrences confirmées : Notes, Historique, Phrases, Catégories, Outils) — aucune hiérarchie visuelle entre Répondre (anodin) et Supprimer (destructif, irréversible sans détour Journal).
- C4-2. Aucun indicateur « nouveaux messages ↓ » quand le panneau est ouvert mais l'utilisateur a remonté dans l'historique (`_chatAtBottom` faux) : `pollChat()` (7650-7655) ne notifie que si le panneau est **fermé** (branche `else`) — panneau ouvert + scroll remonté, un nouveau message peut passer inaperçu.
- C4-3. Largeur du panneau fixe (360px, Index.html:270-285) sans palier intermédiaire entre le seuil `desktop-layout` (769px) et les grands écrans — sur une fenêtre 800-900px, le panneau ouvert laisse ~400-500px au contenu principal, bien sous le `max-width` normal de l'app.
- C4-4. `#chatInput` est un `<textarea>` brut (Index.html:4202), seul champ de texte libre de l'app sans `buildTextEditor()` (barre markdown + boutons `@`/`#` dédiés) malgré un placeholder qui promet « markdown » — la fonctionnalité n'est découvrable qu'en connaissant déjà la syntaxe.
- C4-5. Fenêtre glissante de 500 messages (`MAX_MESSAGES`, Code.gs:1485) jamais signalée côté client — rien ne distingue « c'est tout l'historique » de « c'est une fenêtre glissante » (recoupe C14 ci-dessous, même constat).
- C4-6. État ouvert/fermé du panneau non persisté (`_chatPanelOpen` en mémoire seule, Index.html:7424, 7566-7585) — contrairement au thème, au mode de disposition et à l'identité, tous persistés en `localStorage`. Un rechargement de page referme systématiquement le panneau.
- C14. (recoupe C4-5) Aucun signal quand l'historique dépasse 500 messages.
- C15. `loadChat()` devrait afficher un état d'erreur explicite dans le panneau (pas seulement un toast transitoire) — lié à C11.
- C16. Pas d'anti-doublon/backoff sur les toasts d'erreur répétés (`showToast()`, Index.html:8086-8097) — le Tchat est la seule zone à sondage périodique court (4s) de toute l'app, donc la plus exposée à un empilement de toasts en cas de panne prolongée.

**Axe 5 — Code sain**
- C51. `buildChatMessageEl` (Index.html:7444-7527, ~84 lignes) mélange construction DOM et logique métier de suppression (permission, confirmation, appel serveur, mutation locale) — même anti-motif déjà noté sur `buildNoteCard` en passe 5 (N19), non corrigé entre-temps, troisième occurrence du motif dans l'app.
- C52. Gardes `null` incohérentes dans `initChatWidget()` (Index.html:7591-7608) : `chatToggleBtn`/`chatPanelClose` protégés (`if (btn) …`), mais `chatSendBtn`/`chatInput`/`chatReplyBannerCancel`/`chatMessages` déréférencés sans garde — inoffensif tant que le markup est toujours rendu (juste masqué en CSS), mais deviendrait un point de rupture silencieux si le markup devenait un jour conditionnel.
- C53. Pas de `maxlength` HTML sur `#chatInput` reflétant la limite serveur de 2000 caractères (Code.gs:1552), contrairement à d'autres champs contraints de l'app (icônes, noms de preset) — confiance modérée sur l'analogie (aucun autre champ **long** comparable trouvé), gravité mineure (aucune perte de donnée, le texte est restauré au champ en cas de rejet serveur).
- C54. (recoupe C2b, cause identique confirmée indépendamment par l'axe 5) Fusion `_chatMessages`/`_chatPendingSends` sans déduplication par id/auteur/texte.

## Améliorations candidates — phase 3

**Axe 2** — Exposer `chat_version` (déjà maintenu serveur, Code.gs:176-183) dans la réponse de `apiGetChatMessages` pour que `pollChat()` détecte tout changement réel au lieu d'une heuristique longueur+dernier-id (fermerait C2a à la racine) ; dédupliquer `_chatPendingSends` contre `_chatMessages` avant rendu (fermerait C2b/C54) ; revalider `_chatReplyTo` au moment de l'envoi si le message cité a été supprimé entre-temps.
**Axe 3** — Aligner la couleur du nom dans une citation (`playerColor(msg.replyToAuthor)`) sur celle utilisée pour l'auteur direct, actuellement `var(--text)` générique (Index.html:2216).
**Axe 4** — Toast + « Annuler » 5s pour la suppression d'un message (pattern déjà utilisé ailleurs, `deletePhraseWithUndo`/`scheduleDeletion`) plutôt que le seul recours au Journal d'audit qui rompt le fil de la conversation.
**Axe 5** — Nommer/centraliser les deux longueurs de troncature de citation (80 et 60, Index.html:7545/7508) ; retirer `CHAT_FAB_POS_KEY` (déjà confirmé mort en Carte) ; le motif `requireIdentity()`+`openConfirmModal()`+suppression est systémique à ~16 endroits de l'app (pas spécifique au Tchat, non retenu comme tâche isolée ici).

## Défauts confirmés — phase 4

Vérification par relecture directe du code pour chaque candidat (citations revérifiées personnellement, pas seulement acceptées sur la foi des agents — cohérent avec la fiabilité déjà mesurée des conseils à 5 sur cette session, passe 3 : 7/7 citations exactes sur échantillon).

| # | Verdict | Preuve |
|---|---------|--------|
| R1 | **CONFIRMÉ, très sévère** | Déjà reproduit en direct en phase 2 (deux façons). |
| R2 | **CONFIRMÉ, sévère — nuancé par C11 (axe 1)** | Reproduit en direct en phase 2. Nuance apportée par le conseil (axe 1) : la citation périmée se corrige aussi dès le prochain message envoyé/reçu détecté par `pollChat`/`loadChat` (pas seulement au reload complet) — reste un défaut réel, juste moins absolu qu'énoncé initialement. |
| R3 | **CONFIRMÉ, corrigé** | Déjà corrigé pendant la sonde (mock `Utilities`). |
| Cascade `renameEntity`→Chat | **CONFIRMÉ, sévère** | Relu ligne par ligne (Code.gs:465-525) : `Chat` absent de toute cascade, contrairement à `History`/`AutoRules`/`Notes`. |
| C11 | **CONFIRMÉ, modéré** | Relu : `loadChat()` (7610-7616) sans 5ᵉ argument `onError`. |
| C12 | **CONFIRMÉ, mineur-modéré** | Découle directement de la mécanique déjà confirmée de R2/cache serveur (résolution avant troncature, Code.gs:1535-1542) + `if(target)` sans indice (7509-7515). |
| C13 | **CONFIRMÉ, modéré** | Relu : plafond JS (`innerHeight*0.3`) et plafond CSS (`max-height:120px`, ligne 2232) indépendants et incohérents — confirmé par calcul direct sur les deux mécanismes. |
| C2a | **CONFIRMÉ, modéré, cas limite** | Relu : `newCount = fresh.length - _chatMessages.length` (7645) peut valoir 0 sur un ajout+suppression compensés — trace logique vérifiée exacte. Fenêtre étroite (nécessite une compensation exacte de longueur), mais réelle. |
| C2b / C54 | **CONFIRMÉ, modéré, condition de course** | Relu : aucune déduplication dans `renderChatMessages` (7529-7540) entre `_chatMessages` et `_chatPendingSends` ; le retrait du pending dépend uniquement du callback de succès du POST d'origine (7681), indépendant du cycle de sondage — la course est possible en théorie, non reproduite empiriquement par les deux agents qui l'ont soulevée indépendamment (convergence de deux axes différents sur la même cause = signal de fiabilité). |
| C31 | **CONFIRMÉ** | Relu : `#ff4757`/`#fff` en dur (253-254), variables `--error`/`--on-accent` existantes et inutilisées ici. |
| C32 | **CONFIRMÉ** | Relu : `rgba(255,255,255,0.05)` en dur (235) vs `var(--btn-alt)` au hover (244) ; `--btn-alt` bien différent en clair (`rgba(0,0,0,0.05)`, ligne 71) — incohérence confirmée. |
| C33 | **CONFIRMÉ** | Relu : aucun `<img>` dans le bloc citation (7502-7518) ni dans le bandeau réponse (4194-4200, 7542-7548). |
| C4-1 | **CONFIRMÉ** | Relu : `delBtn` (7483-7485) sans `className`, comparé à 9 occurrences de `class="danger"` ailleurs (grep confirmé). |
| C4-2 | **CONFIRMÉ** | Relu : branche `else if (newCount > 0)` (7652) n'exécute que si `!_chatPanelOpen` — panneau ouvert, aucun signal. |
| C4-3 | **CONFIRMÉ** | Relu : `width: 360px` fixe (270-285), seuil `desktop-layout` à 768px (15938), aucun palier intermédiaire. |
| C4-6 | **CONFIRMÉ** | Relu + grep : aucune clé `localStorage` pour l'état du panneau, contrairement au thème/layout/identité. |
| C51 | **CONFIRMÉ, non prioritaire** | Structure relue, motif identique à `buildNoteCard` déjà documenté non prioritaire en passe 5. |
| C52 | **CONFIRMÉ, mineur** | Relu : gardes incohérentes confirmées, sans impact actuel. |
| C53 | **CONFIRMÉ, mineur, confiance modérée** | Absence de `maxlength` confirmée ; analogie avec d'autres champs contraints jugée valable mais non strictement comparable (agent lui-même nuance sa confiance). |
| C4-4, C4-5/C14, C15, C16, améliorations axes 2/3/5 | **CONFIRMÉS comme améliorations valables** (raison concrète et vérifiable, pas une préférence) | Retenues selon le critère du protocole. |

## Écartés — phase 4

_(aucun candidat rejeté — tous les défauts soumis se sont révélés prouvés par lecture directe du code ; certains reclassés « non prioritaire » plutôt que rejetés, cohérent avec le traitement des passes précédentes pour le code mort/duplication sans bug associé)_

## Correction — phase 5

**Corrigés cette passe :**

1. **R1** — Tchat inaccessible en mobile-layout : bouton flottant + panneau plein écran ajoutés pour `body.mobile-layout` (mêmes éléments/JS que desktop, présentation adaptée). Redimensionnement fenêtre non résilient : `initLayoutModeToggle()` écoute désormais `matchMedia('(max-width:768px)').addEventListener('change', ...)`, sauf disposition forcée explicitement par l'utilisateur. Vérifié en direct : bouton+panneau atteignables et fonctionnels à 375px (chargement frais). Le volet « redimensionnement live » n'a pas pu être re-vérifié dans ce pane (limite d'outillage `resize_window`, voir Leçons du plan-cadre) — validé par relecture de code (API standard) et par la non-régression du chargement initial à toute largeur.
2. **R2** — Citation de réponse figée après suppression : `apiDeleteChatMessage` recharge désormais la liste (`loadChat()`) au lieu de filtrer en local. Vérifié en direct : « Message supprimé » s'affiche immédiatement après confirmation de suppression, sans reload.
3. **Cascade `renameEntity` → Chat** — `SettingsService.renameEntity()` propage le renommage d'un Joueur à la colonne `Auteur` de `Chat` (`Code.gs`). Test de non-régression ajouté (`tests/settings.test.js`), y compris la survie intacte du message d'un joueur non concerné.
4. **C2a** — Badge de non-lus : comptage par id de message jamais vu (`_chatSeenIds`) plutôt que par écart de longueur, insensible à un ajout+suppression compensés entre deux sondages.
5. **C2b / C54** — Doublon visuel message optimiste/confirmé : `renderChatMessages()` déduplique les envois en attente contre les messages déjà confirmés (auteur+texte+réponse-à) avant affichage.
6. **C31 / C32** — Couleurs en dur → variables : `.chat-badge` (`var(--error)`/`var(--on-accent)`), `.nav-chat-btn` repos passé de `rgba(255,255,255,0.05)` à `transparent` (state distinct du hover `var(--btn-alt)` préservé, theme-safe).
7. **C33** — Avatar + couleur ajoutés à la citation de réponse et au bandeau « Répondre à » (alignés sur le traitement de l'auteur direct). Vérifié en direct.
8. **C4-1** — Bouton supprimer un message : classe `danger` ajoutée. Vérifié en direct.
9. **C11** — `loadChat()` : état d'erreur explicite avec bouton « Réessayer » si le premier chargement échoue, au lieu d'un panneau vide sans indice.
10. **C13** — Textarea du composeur : `max-height:120px` CSS retiré (entrait en conflit avec le plafond dynamique déjà géré par `autoGrowTextarea`, coupant le texte visible sans scrollbar sur 5-8 lignes). Vérifié en direct : `clientHeight` égale désormais `scrollHeight` sur un contenu de 7 lignes.
11. **C4-6** — État ouvert/fermé du panneau persisté en `localStorage`. Vérifié en direct : réouverture automatique après rechargement.
12. **C52** — Gardes `null` uniformisées dans `initChatWidget()`.
13. **C53** — `maxlength="2000"` posé sur `#chatInput`, reflétant la limite serveur.
14. **Code mort** — `.chat-fab`/`.chat-fab-badge`/`.chat-panel` (CSS) et `CHAT_FAB_POS_KEY` (JS) retirés ; commentaire d'en-tête du bloc Tchat mis à jour (décrivait encore l'ancien bouton draggable).
15. **R3 (infra de test)** — déjà corrigé pendant la sonde (mock `Utilities` dans `tests/harness.js`) ; couverture de test `ChatService` ajoutée (`tests/chat.test.js`, 8 tests neufs : identité requise, validation longueur, autorisation de suppression, résolution de citation avant/après troncature `MAX_MESSAGES`).

**Reportés, documentés (raison) :**
- **C4-3** (largeur de panneau non réactive entre 769-1100px), **C4-4** (barre d'outils markdown sur le composeur) — nécessitent un choix de présentation (palier intermédiaire, disposition de la barre d'outils) plutôt qu'une simple restauration de fonctionnalité perdue ; reportés pour ne pas engager une refonte visuelle sans accord explicite, conforme aux contraintes globales.
- **C4-5 / C14** (signaler la fenêtre glissante de 500 messages) — nécessite un changement d'API (`apiGetChatMessages` renverrait un indicateur `truncated`) + une bannière UI ; reporté, risque/effort disproportionné pour cette passe déjà chargée.
- **C4-A** (toast + Annuler 5s à la suppression) — pattern existant ailleurs mais ajout de fonctionnalité plus que correctif ; reporté.
- **C16** (anti-doublon des toasts d'erreur répétés) — changement de `showToast()`, utilisé par toute l'app ; hors périmètre d'une correction scopée au Tchat, reporté.
- **C51** (`buildChatMessageEl` mélange DOM et logique métier) — même motif déjà noté non prioritaire sur `buildNoteCard` en passe 5 ; reporté, cohérent avec ce précédent.
- **C12** (clic mort sur une citation hors des 500 derniers messages) — découle de `MAX_MESSAGES`, dépend du même travail que C4-5 (signaler la troncature) ; reporté avec lui.
- **C15 / C16 restants**, améliorations axe 5 (C55 centralisation des longueurs de troncature, C57 helper générique confirm+delete) — améliorations de code sans bug associé, reportées comme pour C13/C14/C16/C17 en passe 3 et N16-N19 en passe 5.

`npm run verify` vert à 169 tests (160 → 169 : +1 cascade `renameEntity`→Chat, +8 `ChatService`). Re-sonde au navigateur après redémarrage du serveur de prévisualisation :
- Mobile (375px, chargement frais) : bouton flottant visible, panneau plein écran ouvrable, fonctionnel.
- Suppression d'un message cité : « Message supprimé » affiché immédiatement, sans reload (contre figé indéfiniment avant correctif).
- Bouton supprimer : classe `danger` confirmée posée.
- Citation de réponse et bandeau « Répondre à » : avatar + couleur du joueur confirmés affichés.
- Textarea 7 lignes : `clientHeight` (178px) égale `scrollHeight` (178px), contre un plafond figé à 118px avant correctif.
- Persistance du panneau : rouvert automatiquement après reload, confirmé.
- Redimensionnement fenêtre en direct (365px→1280px sans reload) : non re-vérifiable dans ce pane (limite d'outillage constatée, voir Leçons) — correctif validé par relecture de code (API standard `matchMedia.addEventListener('change')`) et non-régression du chargement initial à toute largeur testée.
- 0 erreur console (`window.__frontErrors` vide) à travers toute la sonde de re-vérification.

**Garde-fou n°3 — action requise avant push :** cette passe modifie `SettingsService.renameEntity()` (Code.gs), qui cascade désormais aussi vers la feuille `Chat` lors du renommage d'un Joueur. Comportement change : renommer un Joueur dans Paramètres met maintenant aussi à jour le nom d'auteur de ses anciens messages du tchat (auparavant laissés avec l'ancien nom). Testé (non-régression Node + vérification manuelle du reste de la passe), mais **non poussé** — en attente de confirmation utilisateur avant `git push`, conformément au plan-cadre.

---
