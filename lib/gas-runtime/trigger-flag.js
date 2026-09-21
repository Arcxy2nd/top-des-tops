'use strict';

// ScriptApp n'existe pas sur Vercel : le déclencheur horaire de GAS est
// remplacé par un cron Vercel, qui tourne toujours. Ce qui reste réglable par
// l'utilisateur, c'est une propriété du classeur — posée par le même chemin
// d'écriture atomique que le reste, donc visible et corrigeable à la main.

const TRIGGER_FLAG_KEY = 'auto_trigger_installed';
const TRIGGER_HANDLER = 'runAutoPoints';

function createTriggerService(scriptProperties) {
  function installed() {
    return scriptProperties.getProperty(TRIGGER_FLAG_KEY) === '1';
  }

  function getProjectTriggers() {
    if (!installed()) return [];
    return [{ getHandlerFunction: () => TRIGGER_HANDLER }];
  }

  function newTrigger(handler) {
    if (String(handler) !== TRIGGER_HANDLER) {
      // Un handler inconnu n'aurait aucun cron pour l'exécuter : échouer fort
      // plutôt que laisser croire à une automatisation qui ne tournera jamais.
      throw new Error('Déclencheur non supporté sur ce backend (Vercel) : ' + handler);
    }
    const builder = {
      timeBased: () => ({
        everyHours: () => ({
          create() {
            scriptProperties.setProperty(TRIGGER_FLAG_KEY, '1');
            return builder;
          }
        })
      })
    };
    return builder;
  }

  function deleteTrigger() {
    scriptProperties.deleteProperty(TRIGGER_FLAG_KEY);
  }

  return { getProjectTriggers, newTrigger, deleteTrigger };
}

module.exports = { createTriggerService, TRIGGER_FLAG_KEY, TRIGGER_HANDLER };
