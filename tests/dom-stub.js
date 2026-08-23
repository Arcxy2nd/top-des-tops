'use strict';

// DOM minimal, juste assez pour les briques de géométrie/cycle de vie extraites
// d'Index.html (anchorFloating, openModal/closeModal, piège de focus). Ce n'est
// pas un DOM généraliste : il modélise écouteurs, focus, classList, style et
// getBoundingClientRect — exactement ce que ces fonctions touchent.

function makeEl(tag, id) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    id: id || '',
    style: {},
    dataset: {},
    disabled: false,
    children: [],
    parentNode: null,
    innerHTML: '',
    offsetWidth: 100,
    offsetHeight: 20,
    _rect: { top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20 },
    _listeners: {},
    _classes: new Set(),
    _focusCount: 0
  };
  el.classList = {
    add: c => el._classes.add(c),
    remove: c => el._classes.delete(c),
    contains: c => el._classes.has(c),
    toggle: (c, on) => (on ? el._classes.add(c) : el._classes.delete(c))
  };
  el.getBoundingClientRect = () => el._rect;
  el.addEventListener = (type, fn, capture) => {
    const key = type + (capture ? ':capture' : '');
    (el._listeners[key] = el._listeners[key] || []).push(fn);
  };
  el.removeEventListener = (type, fn, capture) => {
    const key = type + (capture ? ':capture' : '');
    const arr = el._listeners[key] || [];
    const i = arr.indexOf(fn);
    if (i !== -1) arr.splice(i, 1);
  };
  el.appendChild = child => { child.parentNode = el; el.children.push(child); return child; };
  el.remove = () => {
    if (!el.parentNode) return;
    const i = el.parentNode.children.indexOf(el);
    if (i !== -1) el.parentNode.children.splice(i, 1);
    el.parentNode = null;
  };
  el.focus = () => { el._focusCount++; if (el.ownerDoc) el.ownerDoc.activeElement = el; };
  el.setAttribute = () => {};
  el.querySelectorAll = () => [];
  el.ownerDoc = null;
  return el;
}

// Compte les écouteurs vivants d'un type donné — base des assertions de fuite.
function listenerCount(node, type, capture) {
  return (node._listeners[type + (capture ? ':capture' : '')] || []).length;
}

function fire(node, type, capture, event) {
  const arr = (node._listeners[type + (capture ? ':capture' : '')] || []).slice();
  arr.forEach(fn => fn(event || {}));
}

function makeEnv(opts) {
  opts = opts || {};
  const byId = {};
  const document = {
    activeElement: null,
    _listeners: {},
    body: makeEl('body'),
    createElement: tag => { const e = makeEl(tag); e.ownerDoc = document; return e; },
    getElementById: id => byId[id] || null,
    addEventListener: (type, fn, capture) => {
      const key = type + (capture ? ':capture' : '');
      (document._listeners[key] = document._listeners[key] || []).push(fn);
    },
    removeEventListener: (type, fn, capture) => {
      const key = type + (capture ? ':capture' : '');
      const arr = document._listeners[key] || [];
      const i = arr.indexOf(fn);
      if (i !== -1) arr.splice(i, 1);
    }
  };
  document.body.ownerDoc = document;

  const window = {
    innerHeight: opts.innerHeight || 800,
    innerWidth: opts.innerWidth || 1280,
    _listeners: {},
    addEventListener: (type, fn) => {
      (window._listeners[type] = window._listeners[type] || []).push(fn);
    },
    removeEventListener: (type, fn) => {
      const arr = window._listeners[type] || [];
      const i = arr.indexOf(fn);
      if (i !== -1) arr.splice(i, 1);
    }
  };

  return {
    document,
    window,
    register: (id, el) => { byId[id] = el; el.id = id; el.ownerDoc = document; return el; },
    makeEl: tag => { const e = makeEl(tag); e.ownerDoc = document; return e; },
    listenerCount,
    fire,
    setTimeout: fn => { fn(); return 0; },
    requestAnimationFrame: fn => { fn(); return 0; },
    console: { log() {}, warn() {}, error() {} }
  };
}

module.exports = { makeEnv, makeEl, listenerCount, fire };
