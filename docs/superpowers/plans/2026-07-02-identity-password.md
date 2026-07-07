# Identity Password Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect identity selection ("Qui suis-je ?") with per-player passwords stored only in the Google Sheet (column D of `Players`), verified server-side, invisible everywhere in the UI — plus a visual overhaul of the identity selector and a polished password modal.

**Architecture:** The password lives in `Players` column D. The backend never sends the password value to the frontend — only a boolean `hasPassword` flag per player. A new API `apiVerifyIdentity(name, password)` performs the comparison server-side. On the frontend, clicking a protected player in the dropdown opens a small password modal (reusing the existing `.modal-backdrop` pattern); on success the identity is stored in `localStorage` exactly as today. Players with an empty password cell are selectable directly, no modal. Note: this is a friendly-trust barrier, not real security (GAS web app has no sessions); acceptable for this app.

**Tech Stack:** Google Apps Script (`Code.gs`), monofile frontend (`Index.html`), Node VM test harness (`tests/harness.js`).

**No git repository** — this project is not a git repo; skip all commit steps and verify via the Node test suite instead.

---

### Task 1: Backend — `hasPassword` flag and `verifyIdentity`

**Files:**
- Modify: `Code.gs` — `SettingsService.getEntities` (~line 138), sheet-structure comment (~line 4), new `SettingsService.verifyIdentity`, new `apiVerifyIdentity` wrapper near the other `api*` functions (~line 1180)
- Test: `tests/identity.test.js` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/identity.test.js` (mirror the style of `tests/settings.test.js`, using `harness.js`):

```javascript
'use strict';

const assert = require('assert');
const { loadBackend } = require('./harness');

function makeContext() {
  return loadBackend({
    players: [
      ['Name', 'Avatar URL', 'Hex color', 'Password'],
      ['Alice', '', '#ff0000', 'sesame'],
      ['Bob', '', '', ''],          // no password
      ['Chloé', '', '', '  pad  '] // password with surrounding spaces in sheet
    ]
  });
}

// getEntities must expose hasPassword but NEVER the password value
{
  const ctx = makeContext();
  const players = ctx.SettingsService.getEntities('Players');
  const alice = players.find(p => p.name === 'Alice');
  const bob   = players.find(p => p.name === 'Bob');
  assert.strictEqual(alice.hasPassword, true);
  assert.strictEqual(bob.hasPassword, false);
  assert.strictEqual(JSON.stringify(players).includes('sesame'), false,
    'password value must never leave the backend');
}

// verifyIdentity: correct / wrong / empty-password player
{
  const ctx = makeContext();
  assert.strictEqual(ctx.SettingsService.verifyIdentity('Alice', 'sesame'), true);
  assert.strictEqual(ctx.SettingsService.verifyIdentity('Alice', 'wrong'), false);
  assert.strictEqual(ctx.SettingsService.verifyIdentity('Alice', ''), false);
  // player without password: any input accepted (no barrier configured)
  assert.strictEqual(ctx.SettingsService.verifyIdentity('Bob', ''), true);
  // sheet value is trimmed before comparison
  assert.strictEqual(ctx.SettingsService.verifyIdentity('Chloé', 'pad'), true);
  // unknown player rejected
  assert.throws(() => ctx.SettingsService.verifyIdentity('Nobody', 'x'), /introuvable/);
}

// apiVerifyIdentity wrapper returns { success, granted }
{
  const ctx = makeContext();
  const ok = ctx.apiVerifyIdentity('Alice', 'sesame');
  assert.deepStrictEqual(ok, { success: true, granted: true });
  const ko = ctx.apiVerifyIdentity('Alice', 'nope');
  assert.deepStrictEqual(ko, { success: true, granted: false });
}

// rename must preserve the password column
{
  const ctx = makeContext();
  ctx.SettingsService.renameEntity('Players', 'Alice', 'Alicia', '', '');
  assert.strictEqual(ctx.SettingsService.verifyIdentity('Alicia', 'sesame'), true);
}

console.log('identity.test.js OK');
```

Note: adapt `loadBackend(...)` invocation to the actual harness API (check how `tests/settings.test.js` builds its sheets — reuse that exact pattern, including sheet keys `players`, `categories`, `history`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/identity.test.js`
Expected: FAIL — `alice.hasPassword` is `undefined`, `verifyIdentity` is not a function.

- [ ] **Step 3: Implement backend changes in `Code.gs`**

Update the header comment (~line 4):

```javascript
 * Players   : [0] Name | [1] Avatar URL | [2] Hex color | [3] Password (never sent to client)
```

In `SettingsService.getEntities`, Players branch (~line 144), add the flag (do NOT add the value):

```javascript
return {
  name:  r[0].toString(),
  meta:  r[1] ? r[1].toString() : "",
  icon:  "",
  color: r[2] ? r[2].toString() : "",
  hasPassword: !!(r[3] && r[3].toString().trim())
};
```

Add to `SettingsService` (after `renameEntity`):

```javascript
/** Returns true if the given password matches the player's password (column D of Players). */
verifyIdentity(name, password) {
  const sheet = ConfigService.getSheets().players;
  const data  = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === name) {
      const stored = data[i][3] ? data[i][3].toString().trim() : "";
      if (!stored) return true; // no password configured → free access
      return stored === (password || "").toString().trim();
    }
  }
  throw new Error(`Joueur "${name}" introuvable.`);
}
```

Add the API wrapper next to the other `api*` functions, following their existing try/catch response pattern (check how `apiSetColor` wraps errors and mirror it):

```javascript
/** Verifies an identity password server-side. Never returns the password itself. */
function apiVerifyIdentity(name, password) {
  try {
    return { success: true, granted: SettingsService.verifyIdentity(name, password) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
```

Important check: confirm the existing writes never clobber column D — `addEntity` appends 3 cells (col D stays empty ✓), `renameEntity` writes range cols 1–3 only ✓, `setEntityColor` writes col 3 ✓. No change needed, the rename test in Step 1 locks this in.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/identity.test.js` → expected: `identity.test.js OK`
Then run the full suite: `node tests/settings.test.js && node tests/storage.test.js && node tests/analytics.test.js && node tests/audit.test.js && node tests/bulk-edit.test.js && node tests/quick-stats.test.js && node tests/cache.test.js`
Expected: all pass (no regression — `getEntities` gained one property, existing consumers ignore it).

---

### Task 2: Frontend — password modal (HTML + CSS)

**Files:**
- Modify: `Index.html` — add modal HTML next to the other modals (~line 2554 area), add CSS in the `/* ── MODAL ── */` or who-am-i section (~line 130–166)

- [ ] **Step 1: Add the modal HTML**

Insert after the existing modals block (e.g. after `presetCreateModal`):

```html
<!-- ══ MODAL : MOT DE PASSE IDENTITÉ ════════════════════════════════════ -->
<div id="identityPwdModal" class="modal-backdrop" style="display:none;" role="dialog" aria-modal="true">
  <div class="modal-box identity-pwd-box">
    <img class="identity-pwd-avatar" id="identityPwdAvatar" src="" alt="" />
    <h3 id="identityPwdTitle">Confirme ton identité</h3>
    <p class="identity-pwd-sub">Entre le mot de passe de <strong id="identityPwdName"></strong></p>
    <div class="modal-field">
      <input type="password" id="identityPwdInput" placeholder="Mot de passe" autocomplete="off" />
    </div>
    <p class="identity-pwd-error" id="identityPwdError" style="display:none;">Mot de passe incorrect.</p>
    <div class="modal-actions">
      <button id="identityPwdCancel" class="secondary" type="button">Annuler</button>
      <button id="identityPwdSubmit" class="primary" type="button">Valider</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add the modal CSS**

Add near the who-am-i styles:

```css
/* ── Identity password modal ── */
.identity-pwd-box { max-width: 320px; text-align: center; }
.identity-pwd-avatar {
  width: 64px; height: 64px; border-radius: 50%; object-fit: cover;
  margin: 0 auto 10px; display: block;
  border: 3px solid var(--identity-pwd-color, var(--border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--identity-pwd-color, transparent) 25%, transparent);
}
.identity-pwd-sub { color: var(--text-muted); font-size: 0.85rem; }
.identity-pwd-error {
  color: #ff4757; font-size: 0.8rem; font-weight: 600; margin: 4px 0 0;
}
.identity-pwd-box.shake { animation: pwd-shake 0.35s ease; }
@keyframes pwd-shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-8px); }
  40%, 80% { transform: translateX(8px); }
}
.identity-pwd-box .modal-field input { text-align: center; letter-spacing: 2px; }
```

Verify `color-mix` renders correctly; if the halo looks wrong in either theme, fall back to `box-shadow: 0 0 0 3px rgba(0,0,0,0.15);`.

- [ ] **Step 3: Visual smoke check**

No JS is wired yet; temporarily set `display:flex` on `#identityPwdModal` in DevTools (open `Index.html` directly in a browser — the modal is pure HTML/CSS, no GAS needed) and check both themes: centered box, avatar circle, centered input, buttons row. Revert nothing (style attribute stays `display:none`).

---

### Task 3: Frontend — wire the modal into `renderWhoAmI`

**Files:**
- Modify: `Index.html` — `renderWhoAmI` (~line 4597), new functions `openIdentityPwdModal` / `closeIdentityPwdModal` just above it

- [ ] **Step 1: Add modal controller functions**

Insert immediately before `renderWhoAmI`:

```javascript
let _identityPwdTarget = null; // player object pending verification

function closeIdentityPwdModal() {
  document.getElementById('identityPwdModal').style.display = 'none';
  document.getElementById('identityPwdInput').value = '';
  document.getElementById('identityPwdError').style.display = 'none';
  _identityPwdTarget = null;
}

function openIdentityPwdModal(player) {
  _identityPwdTarget = player;
  const modal  = document.getElementById('identityPwdModal');
  const avatar = document.getElementById('identityPwdAvatar');
  avatar.src = getAvatarUrl(player.name, player.meta);
  avatar.onerror = () => { avatar.src = getAvatarUrl(player.name, ''); };
  document.getElementById('identityPwdName').textContent = player.name;
  modal.querySelector('.identity-pwd-box').style
    .setProperty('--identity-pwd-color', player.color || 'var(--border)');
  document.getElementById('identityPwdError').style.display = 'none';
  document.getElementById('identityPwdInput').value = '';
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('identityPwdInput').focus(), 50);
}

function submitIdentityPwd() {
  if (!_identityPwdTarget) return;
  const player = _identityPwdTarget;
  const pwd    = document.getElementById('identityPwdInput').value;
  const btn    = document.getElementById('identityPwdSubmit');
  btn.disabled = true;
  callServer('apiVerifyIdentity', [player.name, pwd], res => {
    btn.disabled = false;
    if (res && res.granted) {
      applyIdentity(player.name);
      closeIdentityPwdModal();
      showToast(`Identité confirmée : ${player.name}`, 'success');
    } else {
      const box = document.querySelector('#identityPwdModal .identity-pwd-box');
      document.getElementById('identityPwdError').style.display = 'block';
      box.classList.remove('shake');
      void box.offsetWidth; // restart animation
      box.classList.add('shake');
      document.getElementById('identityPwdInput').select();
    }
  }, 'Vérification identité', () => { btn.disabled = false; });
}

/** Sets the current identity and refreshes the who-am-i button + dropdown. */
function applyIdentity(name) {
  _whoAmI = name;
  localStorage.setItem(WHO_AM_I_KEY, name);
  renderWhoAmI();
  document.getElementById('whoAmIWrap').classList.remove('open');
}
```

Check the exact `display` value the other modals use when shown (`flex` vs `block`) — grep how `phraseEditModal` is opened and match it.

- [ ] **Step 2: Wire modal buttons once at init**

In the app init section (where other one-time listeners are attached — find where `whoAmIBtn` gets its click listener and add nearby):

```javascript
document.getElementById('identityPwdCancel').addEventListener('click', closeIdentityPwdModal);
document.getElementById('identityPwdSubmit').addEventListener('click', submitIdentityPwd);
document.getElementById('identityPwdInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitIdentityPwd();
  if (e.key === 'Escape') closeIdentityPwdModal();
});
document.getElementById('identityPwdModal').addEventListener('click', e => {
  if (e.target.id === 'identityPwdModal') closeIdentityPwdModal();
});
```

- [ ] **Step 3: Route dropdown clicks through the modal**

In `renderWhoAmI`, replace the option click handler body (currently lines ~4634–4641):

```javascript
opt.addEventListener('click', () => {
  if (p.name === _whoAmI) { wrap.classList.remove('open'); return; }
  if (p.hasPassword) {
    wrap.classList.remove('open');
    openIdentityPwdModal(p);
  } else {
    applyIdentity(p.name);
  }
});
```

The old inline `updateBtn()` / class-toggling logic in the handler is replaced by `applyIdentity` → `renderWhoAmI` full re-render (simpler, same visual result).

- [ ] **Step 4: Manual test in browser**

Open `Index.html` in a browser with a stubbed `callServer` if needed, or deploy to GAS test deployment. Verify: unprotected player selects instantly; protected player opens modal; wrong password → shake + error, input selected; correct password → identity set, toast, modal closed; Escape/backdrop/Annuler close without changing identity.

---

### Task 4: Visual overhaul of the identity selector

**Files:**
- Modify: `Index.html` — who-am-i CSS (~lines 130–166) and `renderWhoAmI` dropdown rendering (~line 4623)

- [ ] **Step 1: Upgrade dropdown rendering with header, color ring, lock badge, active check**

In `renderWhoAmI`, replace the dropdown build (from `dropdown.innerHTML = '';` to the end of the `forEach`):

```javascript
dropdown.innerHTML = '';
const header = document.createElement('div');
header.className = 'who-am-i-header';
header.textContent = 'Qui suis-je ?';
dropdown.appendChild(header);

cachedPlayers.forEach(p => {
  const opt = document.createElement('button');
  opt.type = 'button';
  opt.className = 'who-am-i-option' + (p.name === _whoAmI ? ' active' : '');
  if (p.color) opt.style.setProperty('--wai-color', p.color);

  const img = document.createElement('img');
  img.src = getAvatarUrl(p.name, p.meta);
  img.onerror = () => { img.src = getAvatarUrl(p.name, ''); };
  img.alt = '';
  opt.appendChild(img);

  const label = document.createElement('span');
  label.className = 'who-am-i-label';
  label.textContent = p.name;
  opt.appendChild(label);

  const badge = document.createElement('span');
  badge.className = 'who-am-i-badge';
  badge.textContent = p.name === _whoAmI ? '✓' : (p.hasPassword ? '🔒' : '');
  opt.appendChild(badge);

  opt.addEventListener('click', () => {
    if (p.name === _whoAmI) { wrap.classList.remove('open'); return; }
    if (p.hasPassword) {
      wrap.classList.remove('open');
      openIdentityPwdModal(p);
    } else {
      applyIdentity(p.name);
    }
  });
  dropdown.appendChild(opt);
});
```

(This subsumes Task 3 Step 3 — if executing sequentially, apply the handler change once, here.)

- [ ] **Step 2: Upgrade the CSS**

Replace/extend the who-am-i styles (~lines 149–166):

```css
.who-am-i-dropdown {
  display: none; position: fixed; top: 0; left: 0;
  background: var(--card-bg); border: 1px solid var(--border);
  border-radius: 14px; padding: 8px; min-width: 220px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5); z-index: 9999;
  flex-direction: column; gap: 2px;
}
.who-am-i-header {
  font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--text-muted);
  padding: 4px 10px 8px; border-bottom: 1px solid var(--border);
  margin-bottom: 4px;
}
.who-am-i-option {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 10px; border: none;
  background: transparent; color: var(--text); cursor: pointer;
  font-size: 0.85rem; text-align: left; width: 100%;
  transition: background 0.15s, transform 0.1s; font-family: inherit;
}
.who-am-i-option:hover { background: rgba(255,255,255,0.06); transform: translateX(2px); }
.who-am-i-option.active { font-weight: 700; background: rgba(255,255,255,0.08); }
.who-am-i-option img {
  width: 30px; height: 30px; border-radius: 50%; object-fit: cover; flex-shrink: 0;
  border: 2px solid var(--wai-color, transparent);
}
.who-am-i-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.who-am-i-badge { font-size: 0.75rem; opacity: 0.7; flex-shrink: 0; min-width: 16px; text-align: right; }
.who-am-i-option.active .who-am-i-badge { color: #2ed573; opacity: 1; font-weight: 700; }
```

Check hover backgrounds in light theme (the `rgba(255,255,255,…)` hovers may be invisible on light background — if the existing app already uses these values for light theme, keep them; otherwise use the theme variable the rest of the app uses for hovers).

- [ ] **Step 3: Manual visual check both themes**

Dropdown: header, colored avatar rings, 🔒 on protected players, ✓ on active, hover slide. Modal from Task 2/3 still consistent.

---

### Task 5: Documentation updates

**Files:**
- Modify: `context.md` — sheet structure block + "Qui suis-je" mention in guide section
- Modify: `Index.html` — Guide tab text (~line 2511)

- [ ] **Step 1: Update `context.md`**

Sheet structure: `Players    : Name | Avatar URL | Hex color | Password (optionnel, jamais affiché dans l'UI)`. Add one line in the frontend patterns or UX section: identity selection requires the player's password when one is set in the sheet; verification is server-side via `apiVerifyIdentity`; only the sheet owner can see or edit passwords.

- [ ] **Step 2: Update the Guide tab**

Extend the "Qui suis-je ?" paragraph (~line 2511):

```html
<p><strong>Qui suis-je ?</strong> Le sélecteur en haut à droite de la barre de navigation permet de choisir ton identité parmi les joueurs. Utile pour savoir qui a saisi les points. Les identités marquées 🔒 sont protégées par un mot de passe : demande-le au gestionnaire du classeur. Le mot de passe se définit directement dans la colonne D de la feuille <em>Players</em> du Google Sheet (invisible dans l'app).</p>
```

- [ ] **Step 3: Full test suite**

Run all `node tests/*.test.js` files — expected: all pass.

---

## Decisions locked in (rationale)

- **Empty password cell = free access**: no modal for unprotected players; zero friction for the common case, opt-in protection per player.
- **Boolean `hasPassword` only** crosses the wire; the password value never leaves `Code.gs`.
- **Persistence unchanged**: once verified, identity stays in `localStorage` like today (no re-prompt each visit). Someone editing `localStorage` by hand can bypass it — this is a trust barrier between friends, not security; documented in the plan header.
- **Plain-text password in the sheet**: the owner manages and distributes them; hashing would prevent the owner from reading them back, defeating the stated workflow.
- **No new sheet/service**: column D of `Players` + two small functions; KISS, no migration needed (missing column reads as empty = unprotected).
