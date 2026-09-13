'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const INDEX = path.join(__dirname, '..', 'Index.html');
const html  = fs.readFileSync(INDEX, 'utf8');

test('Section Historique des entrées: En-tête réunit titre à gauche et recherche + actions à droite', () => {
  // .hist-head doit contenir le titre h2 et .hist-head-actions
  assert.match(html, /<div class="hist-head">[\s\S]*?<h2>📜 Historique des entrées<\/h2>[\s\S]*?<div class="hist-head-actions">/);

  // Les boutons d'action et la recherche sont regroupés dans .hist-head-actions
  const headActionsMatch = html.match(/<div class="hist-head-actions">([\s\S]*?)<\/div>/);
  assert.ok(headActionsMatch, 'Conteneur .hist-head-actions introuvable');
  const headActionsHtml = headActionsMatch[1];

  assert.ok(headActionsHtml.includes('id="historyTextFilter"'), 'Barre de recherche id=historyTextFilter présente');
  assert.ok(headActionsHtml.includes('id="historyDateClearBtn"'), 'Bouton clear id=historyDateClearBtn présent');
  assert.ok(headActionsHtml.includes('id="histSortBtn"'), 'Bouton tri date id=histSortBtn présent');
  assert.ok(headActionsHtml.includes('id="refreshHistoryBtn"'), 'Bouton actualiser id=refreshHistoryBtn présent');
  assert.ok(headActionsHtml.includes('id="histToggleGroupsBtn"'), 'Bouton déplier lots id=histToggleGroupsBtn présent');
  assert.ok(headActionsHtml.includes('id="histSelectBtn"'), 'Bouton sélection id=histSelectBtn présent');
});

test('Section Historique des entrées: Filtres de date compacts (Du / Au côte à côte) et boutons de période', () => {
  assert.match(html, /<div class="hist-date-bar">[\s\S]*?<div class="hist-date-du-au">[\s\S]*?id="histRangeChips"/);

  // Du et Au sont groupés dans .hist-date-inputs
  assert.match(html, /<div class="hist-date-inputs">[\s\S]*?id="historyDateFrom"[\s\S]*?id="historyDateTo"[\s\S]*?<\/div>/);

  // Chips de période
  assert.match(html, /<div class="hist-fchip-row hist-range-chips" id="histRangeChips"><\/div>/);
});

test('Section Historique des entrées: Filtres Joueurs et Tops organisés en 2 colonnes denses', () => {
  assert.match(html, /<div class="hist-entity-filters">[\s\S]*?<div class="hist-entity-col hist-col-players">[\s\S]*?<div class="hist-entity-col hist-col-tops">/);

  // Colonne Joueurs contient #histPlayerChips
  assert.match(html, /class="hist-entity-col hist-col-players">[\s\S]*?id="histPlayerChips"/);

  // Colonne Tops contient #histCategoryChips et #histAltCategoryChips
  assert.match(html, /class="hist-entity-col hist-col-tops">[\s\S]*?id="histCategoryChips"[\s\S]*?id="histAltCategoryChips"/);
});

test('Section Historique des entrées: Tableau et colonnes préservés en pleine largeur', () => {
  assert.match(html, /<div class="table-wrap">\s*<table>[\s\S]*?<tbody id="historyTableBody"><\/tbody>/);
  assert.match(html, /<th>Date<\/th><th>Joueur<\/th><th>Top<\/th><th>Pts<\/th><th>Saiseur<\/th>/);
  assert.match(html, /<div id="historyPagination" class="pagination"><\/div>/);
  assert.match(html, /<div id="histBulkBar" class="hist-bulk-bar"/);
});

test('Feuille de styles: Présence des règles CSS compactes et responsives', () => {
  // Styles desktop compacts
  assert.match(html, /\.hist-head\s*\{[^}]*justify-content:\s*space-between/s);
  assert.match(html, /\.hist-date-bar\s*\{[^}]*display:\s*flex/s);
  assert.match(html, /\.hist-entity-filters\s*\{[^}]*grid-template-columns:/s);

  // Styles responsives mobile
  assert.match(html, /body\.mobile-layout \.hist-head\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(html, /body\.mobile-layout \.hist-entity-filters\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(html, /body:not\(\.desktop-layout\) \.hist-head\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(html, /body:not\(\.desktop-layout\) \.hist-entity-filters\s*\{[^}]*grid-template-columns:\s*1fr/s);
});
