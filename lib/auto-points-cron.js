'use strict';

// Le cron Vercel tourne pour tous les tenants, mais runDue n'interroge jamais
// la propriété auto_trigger_installed : sans ce filtre, un classeur dont le
// déclencheur n'est pas installé recevrait quand même ses points automatiques.
// Pendant la bascule, c'est ce qui empêche un double exécuteur : un classeur
// encore servi par le déclencheur horaire GAS n'a pas la propriété côté
// Vercel, donc la tâche planifiée le laisse à GAS.
function runAutoPointsIfInstalled(runApi, baseOptions) {
  const probe = runApi(Object.assign({}, baseOptions, { fnName: 'apiGetAutoRules', args: [], readOnly: true }));
  const state = probe && probe.value;
  // État illisible = on s'abstient : un jour de points manqué se rattrape à
  // la main, un doublon de points dans l'historique réel non.
  if (!state || state.success !== true || state.triggerInstalled !== true) {
    return { skipped: true, reason: state && state.success === true ? 'déclencheur non installé' : 'état illisible' };
  }
  const run = runApi(Object.assign({}, baseOptions, { fnName: 'runAutoPoints', args: [] }));
  return { skipped: false, value: run && run.value };
}

module.exports = { runAutoPointsIfInstalled };
