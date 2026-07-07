# Identity Guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block every write operation in the app when `_whoAmI` is null — toast + pulse on the "Qui suis-je?" button, action cancelled.

**Architecture:** Single `requireIdentity()` helper added at the `_whoAmI` declaration site. Every write handler calls it as the first check and returns early on `false`. No changes to `callServer`, no new state.

**Tech Stack:** Vanilla JS + CSS (single-file GAS app — `Index.html`)

---

## Task 1 — CSS animation + `requireIdentity()` helper

**Files:**
- Modify: `Index.html` ~line 106 (CSS block for `.who-am-i-btn`)
- Modify: `Index.html` ~line 2278 (after `let _whoAmI = ...`)

- [ ] **Step 1: Add pulse animation CSS**

Find:
```css
    .who-am-i-btn:hover { background: rgba(255,255,255,0.12); }
```
Insert AFTER:
```css
    @keyframes wai-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.7); }
      70%  { box-shadow: 0 0 0 10px rgba(255, 71, 87, 0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 71, 87, 0); }
    }
    .who-am-i-btn.pulse { animation: wai-pulse 0.5s ease-out 3; }
```

- [ ] **Step 2: Add `requireIdentity()` helper**

Find:
```javascript
  let _whoAmI = localStorage.getItem(WHO_AM_I_KEY) || null;
```
Insert AFTER:
```javascript
  function requireIdentity() {
    if (_whoAmI) return true;
    showToast('Sélectionne ton identité avant d\'agir.', 'error');
    const btn = document.getElementById('whoAmIBtn');
    if (btn) {
      btn.classList.remove('pulse');
      void btn.offsetWidth;
      btn.classList.add('pulse');
      setTimeout(() => btn.classList.remove('pulse'), 1500);
    }
    return false;
  }
```

---

## Task 2 — Lot submission

**Files:**
- Modify: `Index.html` ~line 5915 (`runBulkPlan`)

- [ ] **Step 1: Guard `runBulkPlan`**

Find:
```javascript
  function runBulkPlan(plan, btn) {
    if (!plan.length) { showToast('Rien à enregistrer.', 'error'); return; }
```
Replace with:
```javascript
  function runBulkPlan(plan, btn) {
    if (!requireIdentity()) return;
    if (!plan.length) { showToast('Rien à enregistrer.', 'error'); return; }
```

---

## Task 3 — Historique

**Files:**
- Modify: `Index.html` ~lines 5989, 5968, 6074, 6302, 6779, 6793, 6865, 6981

- [ ] **Step 1: Guard `confirmBulkDelete`**

Find:
```javascript
  function confirmBulkDelete() {
    if (!histSelected.size) { showToast('Aucune entrée sélectionnée.', 'error'); return; }
```
Replace with:
```javascript
  function confirmBulkDelete() {
    if (!requireIdentity()) return;
    if (!histSelected.size) { showToast('Aucune entrée sélectionnée.', 'error'); return; }
```

- [ ] **Step 2: Guard `confirmGroupRows`**

Find:
```javascript
  function confirmGroupRows() {
    if (histSelected.size < 2) { showToast('Sélectionnez au moins 2 entrées pour créer un groupe.', 'error'); return; }
```
Replace with:
```javascript
  function confirmGroupRows() {
    if (!requireIdentity()) return;
    if (histSelected.size < 2) { showToast('Sélectionnez au moins 2 entrées pour créer un groupe.', 'error'); return; }
```

- [ ] **Step 3: Guard `scheduleDeletion`**

Find:
```javascript
  function scheduleDeletion(rowIndexes) {
    const id = ++_pendingDelIdSeq;
```
Replace with:
```javascript
  function scheduleDeletion(rowIndexes) {
    if (!requireIdentity()) return;
    const id = ++_pendingDelIdSeq;
```

- [ ] **Step 4: Guard ungroup button**

Find:
```javascript
          ungroupBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openConfirmModal(
              'Dissocier ce groupe ? Les ' + members.length + ' entrées redeviendront indépendantes.',
              () => {
                callServer('apiUngroupLot',
```
Replace with:
```javascript
          ungroupBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!requireIdentity()) return;
            openConfirmModal(
              'Dissocier ce groupe ? Les ' + members.length + ' entrées redeviendront indépendantes.',
              () => {
                callServer('apiUngroupLot',
```

- [ ] **Step 5: Guard description modal save**

Find:
```javascript
    document.getElementById('mSave').onclick = () => {
      const v = document.getElementById('mDescText').value.trim();
      closeModal();
      callServer('apiUpdateHistoryDescription',
```
Replace with:
```javascript
    document.getElementById('mSave').onclick = () => {
      if (!requireIdentity()) return;
      const v = document.getElementById('mDescText').value.trim();
      closeModal();
      callServer('apiUpdateHistoryDescription',
```

- [ ] **Step 6: Guard `openBulkEditModal`**

Find:
```javascript
  function openBulkEditModal() {
    if (!histSelected.size) return;
```
Replace with:
```javascript
  function openBulkEditModal() {
    if (!requireIdentity()) return;
    if (!histSelected.size) return;
```

- [ ] **Step 7: Guard bulk edit modal save**

Find:
```javascript
    document.getElementById('mbSave').onclick = function() {
      const rowIndexes = Array.from(histSelected);
      const fields = {};
```
Replace with:
```javascript
    document.getElementById('mbSave').onclick = function() {
      if (!requireIdentity()) return;
      const rowIndexes = Array.from(histSelected);
      const fields = {};
```

- [ ] **Step 8: Guard full entry edit modal save**

Find:
```javascript
    document.getElementById('mSave').onclick = function() {
      const date     = document.getElementById('mEditDate').value;
      const pts      = parseInt(document.getElementById('mEditPts').value, 10);
```
Replace with:
```javascript
    document.getElementById('mSave').onclick = function() {
      if (!requireIdentity()) return;
      const date     = document.getElementById('mEditDate').value;
      const pts      = parseInt(document.getElementById('mEditPts').value, 10);
```

---

## Task 4 — Notes

**Files:**
- Modify: `Index.html` ~lines 6573, 6652, 6706, 6749

- [ ] **Step 1: Guard flash note submit**

Find:
```javascript
    const submitFlash = () => {
      if (!flashPlayer) { showToast('Sélectionnez un joueur.', 'error'); return; }
```
Replace with:
```javascript
    const submitFlash = () => {
      if (!requireIdentity()) return;
      if (!flashPlayer) { showToast('Sélectionnez un joueur.', 'error'); return; }
```

- [ ] **Step 2: Guard per-player note submit**

Find:
```javascript
    const submitNpb = () => {
      const text = ta.value.trim();
      if (!text) { showToast('La note est vide.', 'error'); ta.focus(); return; }
      const restore = startBtnLoading(btn, '…');
      callServer('apiAddNote', [player.name, text, npbDate],
```
Replace with:
```javascript
    const submitNpb = () => {
      if (!requireIdentity()) return;
      const text = ta.value.trim();
      if (!text) { showToast('La note est vide.', 'error'); ta.focus(); return; }
      const restore = startBtnLoading(btn, '…');
      callServer('apiAddNote', [player.name, text, npbDate],
```

- [ ] **Step 3: Guard note delete button**

Find:
```javascript
    delBtn.addEventListener('click', () => {
      openConfirmModal('Supprimer cette note ?', () => {
        buzz();
        callServer('apiDeleteNote',
```
Replace with:
```javascript
    delBtn.addEventListener('click', () => {
      if (!requireIdentity()) return;
      openConfirmModal('Supprimer cette note ?', () => {
        buzz();
        callServer('apiDeleteNote',
```

- [ ] **Step 4: Guard note edit modal save**

Find:
```javascript
    document.getElementById('mSave').onclick = () => {
      const v = ta.value.trim();
      if (!v) { showToast('La note ne peut pas être vide.', 'error'); return; }
      closeModal();
      callServer('apiEditNote',
```
Replace with:
```javascript
    document.getElementById('mSave').onclick = () => {
      if (!requireIdentity()) return;
      const v = ta.value.trim();
      if (!v) { showToast('La note ne peut pas être vide.', 'error'); return; }
      closeModal();
      callServer('apiEditNote',
```

---

## Task 5 — Barème

**Files:**
- Modify: `Index.html` ~lines 6616, 6634, 6657

- [ ] **Step 1: Guard bareme entry update**

Find:
```javascript
      ok.addEventListener('click', () => {
        if (!actIn.value.trim()) { showToast('Action vide.', 'error'); return; }
        const restore = startBtnLoading(ok, '…');
        callServer('apiUpdateBaremeEntry',
```
Replace with:
```javascript
      ok.addEventListener('click', () => {
        if (!requireIdentity()) return;
        if (!actIn.value.trim()) { showToast('Action vide.', 'error'); return; }
        const restore = startBtnLoading(ok, '…');
        callServer('apiUpdateBaremeEntry',
```

- [ ] **Step 2: Guard bareme entry delete**

Find:
```javascript
    delBtn.addEventListener('click', () => {
      const restore = startBtnLoading(delBtn, '…');
      callServer('apiDeleteBaremeEntry',
```
Replace with:
```javascript
    delBtn.addEventListener('click', () => {
      if (!requireIdentity()) return;
      const restore = startBtnLoading(delBtn, '…');
      callServer('apiDeleteBaremeEntry',
```

- [ ] **Step 3: Guard bareme entry add**

Find:
```javascript
    const submit = () => {
      if (!actIn.value.trim()) { showToast('Action vide.', 'error'); actIn.focus(); return; }
      const restore = startBtnLoading(addBtn, '…');
      callServer('apiAddBaremeEntry',
```
Replace with:
```javascript
    const submit = () => {
      if (!requireIdentity()) return;
      if (!actIn.value.trim()) { showToast('Action vide.', 'error'); actIn.focus(); return; }
      const restore = startBtnLoading(addBtn, '…');
      callServer('apiAddBaremeEntry',
```

---

## Task 6 — Paramètres (joueurs, catégories, couleurs)

**Files:**
- Modify: `Index.html` ~lines 3904, 4046, 4077, 7090, 7101

- [ ] **Step 1: Guard rename/color modal save**

Find:
```javascript
    document.getElementById('mSave').onclick = () => {
      const n  = document.getElementById('mNewName').value.trim();
      const m  = document.getElementById('mNewMeta').value.trim();
```
Replace with:
```javascript
    document.getElementById('mSave').onclick = () => {
      if (!requireIdentity()) return;
      const n  = document.getElementById('mNewName').value.trim();
      const m  = document.getElementById('mNewMeta').value.trim();
```

- [ ] **Step 2: Guard player color change**

Find:
```javascript
        colorIn.addEventListener('change', () => {
          const p = cachedPlayers.find(p => p.name === item.name);
          if (p) p.color = colorIn.value;
          callServer('apiSetColor', ['Players',
```
Replace with:
```javascript
        colorIn.addEventListener('change', () => {
          if (!requireIdentity()) return;
          const p = cachedPlayers.find(p => p.name === item.name);
          if (p) p.color = colorIn.value;
          callServer('apiSetColor', ['Players',
```

- [ ] **Step 3: Guard category color change**

Find:
```javascript
        colorIn.addEventListener('change', () => {
          const c = cachedCategories.find(c => c.name === item.name);
          if (c) c.color = colorIn.value;
          callServer('apiSetColor', ['Categories',
```
Replace with:
```javascript
        colorIn.addEventListener('change', () => {
          if (!requireIdentity()) return;
          const c = cachedCategories.find(c => c.name === item.name);
          if (c) c.color = colorIn.value;
          callServer('apiSetColor', ['Categories',
```

- [ ] **Step 4: Guard add player button**

Find:
```javascript
    document.getElementById('addPlayerBtn').addEventListener('click', () => {
      const name = document.getElementById('newPlayerName').value.trim();
      const meta = document.getElementById('newPlayerMeta').value.trim();
      if (!name) { showToast('Nom requis.', 'error'); return; }
```
Replace with:
```javascript
    document.getElementById('addPlayerBtn').addEventListener('click', () => {
      if (!requireIdentity()) return;
      const name = document.getElementById('newPlayerName').value.trim();
      const meta = document.getElementById('newPlayerMeta').value.trim();
      if (!name) { showToast('Nom requis.', 'error'); return; }
```

- [ ] **Step 5: Guard add category button**

Find:
```javascript
    document.getElementById('addCategoryBtn').addEventListener('click', () => {
      const name = document.getElementById('newCategoryName').value.trim();
      const meta = document.getElementById('newCategoryMeta').value.trim();
      const icon = document.getElementById('newCategoryIcon').value.trim();
      if (!name) { showToast('Nom requis.', 'error'); return; }
```
Replace with:
```javascript
    document.getElementById('addCategoryBtn').addEventListener('click', () => {
      if (!requireIdentity()) return;
      const name = document.getElementById('newCategoryName').value.trim();
      const meta = document.getElementById('newCategoryMeta').value.trim();
      const icon = document.getElementById('newCategoryIcon').value.trim();
      if (!name) { showToast('Nom requis.', 'error'); return; }
```

---

## Task 7 — Phrases

**Files:**
- Modify: `Index.html` ~lines 2384, 2439, 2452, 2569, 2590, 2639, 2687, 2739, 2771, 2830

- [ ] **Step 1: Guard `setActivePresetId` (couvre les chips preset)**

Find:
```javascript
  function setActivePresetId(id) {
    _activePreset = id || PHRASES_DEFAULT_ID;
    callServer('apiSetActivePhrasePreset',
```
Replace with:
```javascript
  function setActivePresetId(id) {
    if (!requireIdentity()) return;
    _activePreset = id || PHRASES_DEFAULT_ID;
    callServer('apiSetActivePhrasePreset',
```

- [ ] **Step 2: Guard copy fallback phrase button**

Find:
```javascript
          copyBtn.addEventListener('click', () => {
            callServer('apiAddPhrase', [presetName, pool, txt],
```
Replace with:
```javascript
          copyBtn.addEventListener('click', () => {
            if (!requireIdentity()) return;
            callServer('apiAddPhrase', [presetName, pool, txt],
```

- [ ] **Step 3: Guard `deletePhraseWithUndo`**

Find:
```javascript
  function deletePhraseWithUndo(entry, presetName) {
    const toastEl = document.createElement('div');
```
Replace with:
```javascript
  function deletePhraseWithUndo(entry, presetName) {
    if (!requireIdentity()) return;
    const toastEl = document.createElement('div');
```

- [ ] **Step 4: Guard `savePhraseModal`**

Find:
```javascript
  function savePhraseModal() {
    if (!_phraseModalCtx) return;
    const text = (document.getElementById('phraseModalText').value || '').trim();
```
Replace with:
```javascript
  function savePhraseModal() {
    if (!requireIdentity()) return;
    if (!_phraseModalCtx) return;
    const text = (document.getElementById('phraseModalText').value || '').trim();
```

- [ ] **Step 5: Guard `saveCreatePreset`**

Find:
```javascript
  function saveCreatePreset() {
    const name     = (document.getElementById('presetNameInput').value || '').trim();
```
Replace with:
```javascript
  function saveCreatePreset() {
    if (!requireIdentity()) return;
    const name     = (document.getElementById('presetNameInput').value || '').trim();
```

- [ ] **Step 6: Guard `handleDeletePreset`**

Find:
```javascript
  function handleDeletePreset() {
    const active = getActivePresetId();
    const displayName = active === PHRASES_DEFAULT_ID ? 'Défaut' : active;
```
Replace with:
```javascript
  function handleDeletePreset() {
    if (!requireIdentity()) return;
    const active = getActivePresetId();
    const displayName = active === PHRASES_DEFAULT_ID ? 'Défaut' : active;
```

- [ ] **Step 7: Guard `saveRenamePreset`**

Find:
```javascript
  function saveRenamePreset() {
    const oldName = getActivePresetId();
    if (oldName === PHRASES_DEFAULT_ID) return;
```
Replace with:
```javascript
  function saveRenamePreset() {
    if (!requireIdentity()) return;
    const oldName = getActivePresetId();
    if (oldName === PHRASES_DEFAULT_ID) return;
```

- [ ] **Step 8: Guard `saveBulkImport`**

Find:
```javascript
  function saveBulkImport() {
    if (!_bulkImportCtx) return;
    const lines = parseBulkImportText(document.getElementById('bulkImportTextarea').value);
```
Replace with:
```javascript
  function saveBulkImport() {
    if (!requireIdentity()) return;
    if (!_bulkImportCtx) return;
    const lines = parseBulkImportText(document.getElementById('bulkImportTextarea').value);
```

---

## Task 8 — Outils

**Files:**
- Modify: `Index.html` ~lines 7186, 7196, 7327

- [ ] **Step 1: Guard fix zero points**

Find:
```javascript
    document.getElementById('fixZeroBtn').addEventListener('click', () => {
      openConfirmModal('Supprimer toutes les entrées à 0 point ? Cette action est irréversible.', () => {
```
Replace with:
```javascript
    document.getElementById('fixZeroBtn').addEventListener('click', () => {
      if (!requireIdentity()) return;
      openConfirmModal('Supprimer toutes les entrées à 0 point ? Cette action est irréversible.', () => {
```

- [ ] **Step 2: Guard delete orphans**

Find:
```javascript
    document.getElementById('deleteOrphansBtn').addEventListener('click', () => {
      openConfirmModal('Supprimer les entrées orphelines (joueur/Top disparu) ? Irréversible.', () => {
```
Replace with:
```javascript
    document.getElementById('deleteOrphansBtn').addEventListener('click', () => {
      if (!requireIdentity()) return;
      openConfirmModal('Supprimer les entrées orphelines (joueur/Top disparu) ? Irréversible.', () => {
```

- [ ] **Step 3: Guard merge distributed lots**

Find:
```javascript
    mergeBtn.addEventListener('click', () => {
      const selected = lotEls.filter(l => l.cb.checked);
      if (!selected.length) { showToast('Aucun lot coché.', 'error'); return; }
```
Replace with:
```javascript
    mergeBtn.addEventListener('click', () => {
      if (!requireIdentity()) return;
      const selected = lotEls.filter(l => l.cb.checked);
      if (!selected.length) { showToast('Aucun lot coché.', 'error'); return; }
```

---

## Self-Review

- **Spec coverage:** tous les writes listés dans le design sont couverts (lot, historique ×6, notes ×4, barème ×3, paramètres ×5, phrases ×8, outils ×3)
- **Placeholders:** aucun
- **Type consistency:** `requireIdentity()` est déclaré avant tout appel (ligne 2278, avant les fonctions métier)
- **Risque non couvert intentionnellement:** `apiSavePhrasesBatch` au démarrage (seeding `__default__`) — c'est une initialisation système, non une action utilisateur. Ignoré conformément au YAGNI.
