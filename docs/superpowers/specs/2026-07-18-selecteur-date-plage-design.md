# Spec — Refonte du sélecteur date/plage (Saisie de lot)

Date : 2026-07-18
Statut : approuvé (design validé oralement par l'utilisateur)

## Problème

Le sélecteur date/plage de chaque ligne de la Saisie de lot n'est pas intuitif. Griefs
confirmés par l'utilisateur (les quatre) :

1. **Abstrait** — deux champs (début/fin) + un filtre par jour de la semaine.
2. **Jargon** — « Répéter / Répartir » n'explique pas l'effet.
3. **Mode caché** — la case à cocher « Plage » comme bascule n'est pas évidente.
4. **Sens flou** — on ne voit pas l'effet chiffré.

Une première tentative (pastille + popover) a été rejetée : elle déplaçait les mêmes
contrôles derrière un clic sans rien rendre plus ergonomique.

## Cas d'usage réels (dixit utilisateur)

- **Un total sur une période** → à répartir sur les jours.
- **Une activité qui a duré X jours** → le score couvre la période continue.

Conséquence clé : les deux cas sont des **périodes continues**. Le **filtre par jour de la
semaine n'est jamais utilisé** → on le retire de l'UI.

## Design retenu

Cellule date d'une ligne :

1. **Interrupteur segmenté** en tête, très visible, remplace la case à cocher :
   `[ Un jour ] [ Une période ]`. Pilote `.range-cb.checked`.
2. **Mode « Un jour »** (défaut) : champ date `.d-start` + raccourcis (Auj./Hier…). Inchangé.
3. **Mode « Une période »** : **mini-calendrier** inline (se déplie sous la ligne) — clic
   1er jour puis dernier jour, période colorée entre les deux. + raccourcis de période
   (7 derniers jours, Ce mois…). Écrit dans `.d-start` / `.d-end`.
4. **Choix Répéter/Répartir en langage clair** (le composant `createFillToggle` est refait) :
   `Le même score chaque jour` / `Un total à répartir`. Plus une **ligne d'aperçu chiffré
   live** : « 3 pts chaque jour × 7 jours = 21 au total » ou « 21 pts ÷ 7 jours ≈ 3 / jour ».
5. **Suppression UI** du sélecteur de jours de la semaine. Un `.day-picker-wrap` caché
   (`dataset.days='[]'`) est conservé comme hook → envoi/duplication/« Appliquer à toutes »
   inchangés côté lecture. Backend non touché.

Cohérence : le bloc « Date/plage par défaut » adopte le même interrupteur segmenté et le
même libellé clair (via `createFillToggle` refait). Pas de calendrier là-bas (simple
template de défaut).

## Hooks de lecture préservés

`.d-start`, `.d-end`, `.range-cb` (coché = période), `.line-fill` (`dataset.fill`),
`.day-picker-wrap` (`dataset.days`). `applyDateAllBtn` : matching du fill passe de
`textContent` à `data-fill`.

## Parité mobile

`Mobile.html` inchangé : saisie de lot mobile à date unique, sans plage (choix assumé).

## Hors périmètre

Sélection de jours non contigus / filtre jours de semaine (cas « rattraper les lundis »,
non utilisé).
