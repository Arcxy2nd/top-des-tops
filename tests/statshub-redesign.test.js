'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet } = require('./harness');

const HEADER = ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'];
const D = s => new Date(s + 'T12:00:00');
const mk = (d, p, c, pts, desc, s) => [D(d), p, c, pts, desc || '', '', s || ''];

test('apiGetPlayerRecords returns bestCategory for each player and in globalBest', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    mk('2026-01-01', 'Alice', 'Jeux', 10),
    mk('2026-01-02', 'Alice', 'Défis', 50),
    mk('2026-01-03', 'Alice', 'Jeux', 20),
    mk('2026-01-04', 'Bob', 'Cuisine', 35)
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiGetPlayerRecords();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.records.length, 2);

  const alice = res.records.find(r => r.player === 'Alice');
  assert.strictEqual(alice.bestSingleEntry, 50);
  assert.strictEqual(alice.bestCategory, 'Défis');
  assert.strictEqual(alice.longestStreakDays, 3);

  const bob = res.records.find(r => r.player === 'Bob');
  assert.strictEqual(bob.bestSingleEntry, 35);
  assert.strictEqual(bob.bestCategory, 'Cuisine');
  assert.strictEqual(bob.longestStreakDays, 1);

  assert.strictEqual(res.globalBest.player, 'Alice');
  assert.strictEqual(res.globalBest.points, 50);
  assert.strictEqual(res.globalBest.category, 'Défis');
});

test('apiGetTrends computes comprehensive 30d vs 30d trends and global summary', () => {
  const gas = loadGas();
  const now = new Date();
  const daysAgo = n => new Date(now.getTime() - n * 86400000);
  const iso = d => d.toISOString().slice(0, 10);

  const history = makeSheet([
    HEADER,
    // Période précédente (30 à 60 jours avant)
    mk(iso(daysAgo(45)), 'Alice', 'Jeux', 10),
    mk(iso(daysAgo(40)), 'Alice', 'Jeux', 10),
    mk(iso(daysAgo(35)), 'Bob', 'Défis', 20),
    // Période récente (0 à 30 jours avant)
    mk(iso(daysAgo(20)), 'Alice', 'Jeux', 15),
    mk(iso(daysAgo(15)), 'Alice', 'Jeux', 15),
    mk(iso(daysAgo(10)), 'Alice', 'Jeux', 15),
    mk(iso(daysAgo(5)),  'Charlie', 'Cuisine', 25)
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiGetTrends();
  assert.strictEqual(res.success, true);

  // Vérification tendances catégories
  const jeux = res.categoryTrends.find(c => c.category === 'Jeux');
  assert.strictEqual(jeux.before, 2);
  assert.strictEqual(jeux.after, 3);
  assert.strictEqual(jeux.beforePts, 20);
  assert.strictEqual(jeux.afterPts, 45);
  assert.strictEqual(jeux.changePct, 50); // (3 - 2) / 2 = +50%

  // Vérification joueur devenu inactif (Bob) : avant 1, après 0 -> -100%
  const bob = res.playerTrends.find(p => p.player === 'Bob');
  assert.ok(bob, 'Bob doit être présent pour signaler son recul d’activité');
  assert.strictEqual(bob.before, 1);
  assert.strictEqual(bob.after, 0);
  assert.strictEqual(bob.changePct, -100);

  // Vérification joueur nouvellement actif (Charlie) : avant 0, après 1 -> +100%
  const charlie = res.playerTrends.find(p => p.player === 'Charlie');
  assert.ok(charlie);
  assert.strictEqual(charlie.before, 0);
  assert.strictEqual(charlie.after, 1);
  assert.strictEqual(charlie.changePct, 100);

  // Vérification synthèse globale
  assert.ok(res.summary);
  assert.strictEqual(res.summary.prevTotalEntries, 3);
  assert.strictEqual(res.summary.recentTotalEntries, 4);
  assert.strictEqual(res.summary.prevTotalPoints, 40);
  assert.strictEqual(res.summary.recentTotalPoints, 70);
  assert.strictEqual(res.summary.entriesChangePct, 33);
  assert.strictEqual(res.summary.pointsChangePct, 75);
});

test('apiGetActiveWeekday starts on Monday and computes weekday vs weekend split', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    mk('2026-01-05', 'Alice', 'Jeux', 5),  // Lundi
    mk('2026-01-06', 'Alice', 'Jeux', 5),  // Mardi
    mk('2026-01-07', 'Alice', 'Jeux', 5),  // Mercredi
    mk('2026-01-08', 'Alice', 'Jeux', 5),  // Jeudi
    mk('2026-01-09', 'Alice', 'Jeux', 5),  // Vendredi
    mk('2026-01-10', 'Alice', 'Jeux', 5),  // Samedi
    mk('2026-01-11', 'Alice', 'Jeux', 5),  // Dimanche
    mk('2026-01-12', 'Alice', 'Jeux', 5),  // Lundi (2ème entrée Lundi -> champion)
    mk('2026-01-19', 'Alice', 'Jeux', 5),  // Lundi (3ème entrée Lundi)
    mk('2026-01-18', 'Alice', 'Jeux', 5)   // Dimanche (2ème entrée Dimanche)
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiGetActiveWeekday();
  assert.strictEqual(res.success, true);

  // Ordre strict Lundi -> Dimanche
  assert.strictEqual(res.byWeekday[0].weekday, 'Lundi');
  assert.strictEqual(res.byWeekday[1].weekday, 'Mardi');
  assert.strictEqual(res.byWeekday[2].weekday, 'Mercredi');
  assert.strictEqual(res.byWeekday[3].weekday, 'Jeudi');
  assert.strictEqual(res.byWeekday[4].weekday, 'Vendredi');
  assert.strictEqual(res.byWeekday[5].weekday, 'Samedi');
  assert.strictEqual(res.byWeekday[6].weekday, 'Dimanche');

  // Lundi a 3 entrées sur 10 (30%)
  assert.strictEqual(res.topWeekday, 'Lundi');
  assert.strictEqual(res.topWeekdayCount, 3);
  assert.strictEqual(res.topWeekdayPct, 30);
  assert.strictEqual(res.totalEntries, 10);

  // Semaine (Lun-Ven) = 3 (Lun) + 1 (Mar) + 1 (Mer) + 1 (Jeu) + 1 (Ven) = 7 entrées (70%)
  // Week-end (Sam-Dim) = 1 (Sam) + 2 (Dim) = 3 entrées (30%)
  assert.strictEqual(res.weekdayVsWeekend.weekdayCount, 7);
  assert.strictEqual(res.weekdayVsWeekend.weekendCount, 3);
  assert.strictEqual(res.weekdayVsWeekend.weekdayPct, 70);
  assert.strictEqual(res.weekdayVsWeekend.weekendPct, 30);
});

test('apiGetTopPlayerCategoryPairs calculates totalPoints and avgPoints per combo', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    mk('2026-01-01', 'Alice', 'Jeux', 10),
    mk('2026-01-02', 'Alice', 'Jeux', 20),
    mk('2026-01-03', 'Alice', 'Jeux', 30),
    mk('2026-01-04', 'Bob', 'Jeux', 100),
    mk('2026-01-05', 'Bob', 'Jeux', 100)
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiGetTopPlayerCategoryPairs();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.pairs.length, 2);

  // Alice & Jeux : 3 fois, total 60 pts, moyenne 20 pts
  const aliceJeux = res.pairs[0];
  assert.strictEqual(aliceJeux.player, 'Alice');
  assert.strictEqual(aliceJeux.category, 'Jeux');
  assert.strictEqual(aliceJeux.count, 3);
  assert.strictEqual(aliceJeux.totalPoints, 60);
  assert.strictEqual(aliceJeux.avgPoints, 20);

  // Bob & Jeux : 2 fois, total 200 pts, moyenne 100 pts
  const bobJeux = res.pairs[1];
  assert.strictEqual(bobJeux.player, 'Bob');
  assert.strictEqual(bobJeux.category, 'Jeux');
  assert.strictEqual(bobJeux.count, 2);
  assert.strictEqual(bobJeux.totalPoints, 200);
  assert.strictEqual(bobJeux.avgPoints, 100);
});
