// Injecté dans <head> par serve.js. Reproduit la seule API que Index.html
// consomme du côté Google : google.script.run et son couple de gestionnaires.
// Les erreurs sont poussées dans window.__frontErrors ET dans document.title :
// le titre est la seule voie de sortie lisible par un client HTTP sans DevTools.
(function () {
  window.__frontErrors = [];
  window.__frontCalls  = [];

  function record(kind, detail) {
    window.__frontErrors.push(kind + ': ' + detail);
    document.title = 'ERRORS=' + window.__frontErrors.length + ' | ' + window.__frontErrors.join(' || ');
  }

  window.addEventListener('error', e => {
    record('window.error', (e.message || '?') + ' @ ' + (e.filename || '?') + ':' + (e.lineno || 0));
  });
  window.addEventListener('unhandledrejection', e => {
    record('unhandledrejection', String((e.reason && e.reason.message) || e.reason));
  });

  function makeRunner(successHandler, failureHandler) {
    return new Proxy({}, {
      get(_t, prop) {
        if (prop === 'withSuccessHandler') return h => makeRunner(h, failureHandler);
        if (prop === 'withFailureHandler') return h => makeRunner(successHandler, h);
        return function () {
          const args = Array.prototype.slice.call(arguments);
          window.__frontCalls.push(prop);
          fetch('/call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fn: prop, args: args })
          })
            .then(r => r.json())
            .then(payload => {
              if (!payload.ok) {
                if (failureHandler) failureHandler(new Error(payload.error));
                return;
              }
              // Une exception jetée ici par le code de l'app est exactement la panne
              // recherchée : la capturer explicitement, google.script.run l'avale.
              try {
                if (successHandler) successHandler(payload.value);
              } catch (err) {
                record('successHandler(' + prop + ')', (err && err.stack) || String(err));
              }
            })
            .catch(err => record('transport(' + prop + ')', String(err)));
        };
      }
    });
  }

  window.google = { script: { run: makeRunner(null, null), host: { setHeight() {}, editor: { focus() {} } }, url: { getLocation(cb) { cb({ parameter: {} }); } } } };
})();
