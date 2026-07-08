# Fix bascule mobile/PC — adresse serveur + vrai lien

## Contexte

Le bouton 📱/🖥️ (`Index.html:layoutModeToggle`, `Mobile.html:mViewToggle`) navigue actuellement en JavaScript via `window.top.location.href = '?view=mobile'` (ou `'?view=desktop'`). Constaté en usage réel : le clic n'a souvent aucun effet, et quand il en a un, il atterrit sur une adresse interne au bac à sable Google (`https://n-xxxx-script.googleusercontent.com/userCodeAppPanel?view=mobile`) au lieu du vrai site.

**Cause racine (confirmée par la documentation Google) :** deux problèmes cumulés.
1. Une URL relative assignée à `location.href` est résolue par le navigateur contre l'adresse du document qui exécute le script — ici notre propre iframe (bac à sable Google), pas contre l'adresse de la page réellement affichée à l'écran (`script.google.com/.../exec`).
2. La navigation du cadre du haut pilotée par script peut être bloquée par le mode bac à sable d'Apps Script (absence du flag `allow-top-navigation`), qui recommande explicitement d'utiliser un vrai lien (`<a target="_top">`) plutôt qu'une assignation `window.top.location.href` en JavaScript.

Sources : [HTML Service: Restrictions](https://developers.google.com/apps-script/guides/html/restrictions), [Migrate to IFRAME Sandbox Mode](https://developers.google.com/apps-script/migration/iframe).

## Objectif

Le bouton bascule mobile/PC fonctionne de façon fiable, dans les deux fichiers (`Index.html`, `Mobile.html`), sans dépendre de la structure interne du bac à sable Google ni de l'ID de déploiement courant (qui change à chaque redéploiement automatique).

## Décisions

### 1. Le serveur fournit l'adresse publique exacte, injectée au rendu de la page

`ScriptApp.getService().getUrl()` renvoie l'adresse `/exec` réelle et à jour du déploiement courant — la même que celle utilisée pour accéder à l'app (via le lien court short.io, qui redirige vers cette adresse). `doGet` (`Code.gs:875`) passe d'un rendu statique (`HtmlService.createHtmlOutputFromFile`) à un rendu **templaté** (`HtmlService.createTemplateFromFile(...).evaluate()`), qui permet d'injecter cette adresse directement dans le HTML servi, sous forme d'une variable JavaScript lue au chargement — pas d'appel serveur supplémentaire nécessaire.

```js
function doGet(e) {
  const view = e && e.parameter ? e.parameter.view : null;
  const file = view === 'mobile' ? 'Mobile' : 'Index';
  const template = HtmlService.createTemplateFromFile(file);
  template.appUrl = ScriptApp.getService().getUrl();
  return template.evaluate()
    .setTitle('Tops des Tops')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

Dans `Index.html`/`Mobile.html`, un petit scriptlet en tête de script (juste après l'ouverture de `<script>`) capture cette valeur :

```html
<script>
  const APP_URL = <?!= JSON.stringify(appUrl) ?>;
  ...
</script>
```

### 2. Le bouton devient un vrai lien `<a>`, plus de navigation pilotée par script

Le `<button id="layoutModeToggle">`/`<button id="mViewToggle">` est remplacé par un `<a>` avec la même apparence (mêmes classes CSS), un `href` construit à partir de `APP_URL`, et `target="_top"` explicite (les deux fichiers ont déjà `<base target="_top">`, mais l'expliciter sur l'élément lève toute ambiguïté). Le clic déclenche une vraie navigation de lien, ce que le bac à sable autorise sans condition — plus de dépendance à un flag de permission de navigation par script.

Le seul JavaScript restant sur ce bouton : mémoriser la préférence dans `localStorage` **avant** que la navigation ne parte (un gestionnaire `click` classique, sans `preventDefault`, s'exécute avant que le navigateur suive le lien).

```html
<a class="layout-mode-toggle" id="layoutModeToggle" target="_top"
   aria-label="Basculer l'affichage mobile/desktop" title="Passer à la version mobile">🖥️</a>
```
```js
document.getElementById('layoutModeToggle').addEventListener('click', () => {
  localStorage.setItem('tdt_layout_mode', 'mobile');
});
```
(le `href` est posé une fois au chargement, avant tout clic — voir plan d'implémentation).

### 3. Correction — la redirection automatique au premier chargement est retirée, pas juste corrigée

**Ce point a été révisé pendant l'implémentation, suite à un incident en production.** L'hypothèse initiale ci-dessus (passer l'URL relative en URL absolue suffirait) s'est révélée fausse : le message d'erreur observé en réel (`Uncaught SecurityError: ... The current window does not have permission to navigate the target frame ... sandboxed with the 'allow-top-navigation-by-user-activation' flag, but has no user activation (aka gesture)`) confirme que le bac à sable bloque **toute** navigation du cadre du haut pilotée par script sans clic réel — peu importe que l'URL soit relative ou absolue. C'est cette redirection automatique (dans `initLayoutMode()`, exécutée sans clic utilisateur) qui plantait `window.onload` avant que les données ne se chargent (incident constaté : "le site est là mais rien ne charge").

Décision finale : la redirection automatique est **retirée entièrement**, pas corrigée. `Index.html` reste toujours la version servie par défaut (cohérent avec un commentaire déjà présent dans `doGet` d'une session antérieure, qui avait tiré la même conclusion côté serveur). Seul un vrai clic sur le lien 📱/🖥️ change de version — et c'est justement ce cas (un vrai clic) que les points 1 et 2 ci-dessus corrigent.

## Vérification

- Backend : test unitaire pour `doGet` confirmant que le template est évalué et que `appUrl` est bien injecté (`tests/doget-routing.test.js`, avec `HtmlService.createTemplateFromFile` et `ScriptApp.getService().getUrl()` stubbés dans `tests/harness.js`). ✅ Fait.
- Frontend : validation manuelle après déploiement — cliquer le bouton bascule dans les deux sens (Index.html → Mobile.html → Index.html), confirmer que l'adresse affichée dans le navigateur est bien celle du site (lien court ou `/exec`), pas une adresse `googleusercontent.com`. **Encore à vérifier en conditions réelles après déploiement.**

## Hors périmètre

- Changement du mécanisme de lien court short.io lui-même.
- Toute forme de détection/bascule automatique au chargement — définitivement écartée (point 3), pas seulement pour cette itération.

## Statut

Implémenté et déployé le 2026-07-09 (commit `20f1dbe`), en urgence suite à l'incident de production ci-dessus — sans passer par un plan d'implémentation séparé, vu la gravité (données ne se chargeant plus). Ce document reflète l'état final réellement livré.
