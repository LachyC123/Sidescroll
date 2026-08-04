// On-screen controls.
//
// Without these the game is unplayable on a phone: every input path went
// through a keyboard or a gamepad, so a touch device had no way to move, let
// alone get past the title screen.
//
// The buttons are DOM elements rather than canvas-drawn hit regions, so they
// stay crisp at any device pixel ratio, scale with CSS, and cost nothing per
// frame. They feed InputService's virtual button set, which means menus,
// prompts, rebinding and gameplay all work from touch without any of them
// knowing touch exists.
//
// A single pointer tracker handles all active touches, so the player can hold
// left while tapping jump, and can slide a thumb from left to right across the
// pad without lifting -- which is how a d-pad is actually used.

import { setVirtual, clearVirtual } from './input.js';

const LAYOUT = [
  // id, action(s), label, side, row
  { id: 'left',   act: 'left',   label: '◀', side: 'l' },
  { id: 'right',  act: 'right',  label: '▶', side: 'l' },
  { id: 'up',     act: 'up',     label: '▲', side: 'l' },
  { id: 'down',   act: 'down',   label: '▼', side: 'l' },
  { id: 'attack', act: 'attack', label: 'HIT',    side: 'r', primary: true },
  { id: 'jump',   act: 'jump',   label: 'JUMP',   side: 'r', primary: true },
  { id: 'heal',   act: 'heal',   label: 'MEND',   side: 'r', small: true },
  { id: 'use',    act: 'interact', label: 'USE',  side: 'r', small: true },
];

let root = null;
const buttons = new Map();          // element -> action
const activePointers = new Map();   // pointerId -> element

export function isTouchDevice() {
  return (navigator.maxTouchPoints || 0) > 0
      || matchMedia('(pointer: coarse)').matches;
}

export function isEnabled() { return !!root && !root.hidden; }

export function setEnabled(on) {
  if (!root) return;
  root.hidden = !on;
  if (!on) { clearVirtual(); activePointers.clear(); paintAll(); }
  document.body.classList.toggle('touch-on', !!on);
  dispatchEvent(new Event('resize'));
}

function mk(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

export function install() {
  if (root) return root;
  // Must live inside the layout column, after the canvas. Mounted on <body> it
  // sits in normal flow above the fixed stage, which put the whole pad at the
  // top of the screen with the game beneath it.
  const stage = document.getElementById('stage') || document.body;
  root = mk('div', 'tc', stage);
  root.hidden = true;

  const left = mk('div', 'tc-side tc-l', root);
  const mid = mk('div', 'tc-mid', root);
  const right = mk('div', 'tc-side tc-r', root);

  // A full four-way pad at full size. Up and down look redundant for a
  // side-scroller, but every menu in the game is navigated with them, and a
  // menu you cannot navigate is a dead end on a phone.
  const pad = mk('div', 'tc-pad', left);
  for (const spec of LAYOUT.filter((b) => b.side === 'l')) {
    const b = mk('button', 'tc-btn tc-' + spec.id + (spec.small ? ' tc-sm' : ''), pad);
    b.textContent = spec.label;
    b.setAttribute('aria-label', spec.id);
    b.type = 'button';
    buttons.set(b, spec.act);
  }

  // The small right-hand actions stack above the two big ones, so a narrow
  // phone does not push the row past the edge of the screen.
  const rTop = mk('div', 'tc-row', right);
  const rBot = mk('div', 'tc-row', right);
  for (const spec of LAYOUT.filter((b) => b.side === 'r')) {
    const b = mk('button', 'tc-btn tc-' + spec.id
                 + (spec.primary ? ' tc-big' : ' tc-sm'),
                 spec.primary ? rBot : rTop);
    b.textContent = spec.label;
    b.setAttribute('aria-label', spec.id);
    b.type = 'button';
    buttons.set(b, spec.act);
  }

  // Pause and back live in the middle column rather than floating over the
  // canvas: absolutely positioned they drifted off-screen on narrower phones.
  for (const [id, act, label] of [['cancel', 'cancel', 'BACK'], ['pause', 'pause', 'II']]) {
    const b = mk('button', 'tc-btn tc-sm tc-' + id, mid);
    b.textContent = label;
    b.setAttribute('aria-label', id);
    b.type = 'button';
    buttons.set(b, act);
  }

  attach();
  return root;
}

function buttonAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const b = el.closest ? el.closest('.tc-btn') : null;
  return b && buttons.has(b) ? b : null;
}

function paintAll() {
  const held = new Set(activePointers.values());
  for (const b of buttons.keys()) b.classList.toggle('is-down', held.has(b));
}

/** Recompute the whole virtual set from the live pointers. */
function sync() {
  clearVirtual();
  for (const b of activePointers.values()) setVirtual(buttons.get(b), true);
  paintAll();
}

function attach() {
  const down = (e) => {
    const b = buttonAt(e.clientX, e.clientY);
    if (!b) return;
    e.preventDefault();
    activePointers.set(e.pointerId, b);
    sync();
  };
  const move = (e) => {
    if (!activePointers.has(e.pointerId)) return;
    e.preventDefault();
    // sliding off a button releases it; sliding onto another presses that one
    const b = buttonAt(e.clientX, e.clientY);
    if (b) activePointers.set(e.pointerId, b);
    else activePointers.delete(e.pointerId);
    sync();
  };
  const up = (e) => {
    if (!activePointers.has(e.pointerId)) return;
    e.preventDefault();
    activePointers.delete(e.pointerId);
    sync();
  };

  // listeners live on the document so a pointer that leaves a button, or is
  // cancelled by the browser, still releases the action instead of sticking on
  addEventListener('pointerdown', down, { passive: false });
  addEventListener('pointermove', move, { passive: false });
  addEventListener('pointerup', up, { passive: false });
  addEventListener('pointercancel', up, { passive: false });
  // a backgrounded tab must not leave the player running into a pit
  addEventListener('blur', () => { activePointers.clear(); sync(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { activePointers.clear(); sync(); }
  });
  // stop long-press selection and the iOS callout on the pad
  root.addEventListener('contextmenu', (e) => e.preventDefault());
}
