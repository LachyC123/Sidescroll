// InputService: actions, rebinding, device detection and glyph family.
// Section 11 contract: actions, rebinding, glyph family, hold/toggle
// preferences and device change. Tutorial prompts read `device` so a glyph
// swaps the moment the player touches a different controller.

export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'heal',
                        'interact', 'pause', 'map', 'cancel'];

export const DEFAULT_KEYS = {
  left:     ['ArrowLeft', 'KeyA'],
  right:    ['ArrowRight', 'KeyD'],
  up:       ['ArrowUp', 'KeyW'],
  down:     ['ArrowDown', 'KeyS'],
  jump:     ['Space', 'KeyZ', 'KeyK'],
  attack:   ['KeyJ', 'KeyX', 'Enter'],
  heal:     ['KeyC', 'KeyH'],
  interact: ['KeyE', 'KeyF'],
  pause:    ['Escape', 'KeyP'],
  map:      ['Tab', 'KeyM'],
  cancel:   ['Backspace', 'KeyQ'],
};

// Standard Gamepad API button indices.
const DEFAULT_PADS = {
  jump: [0], attack: [2, 1], heal: [3], interact: [3], pause: [9], map: [8],
  cancel: [1], up: [12], down: [13], left: [14], right: [15],
};

const state = {};      // action -> bool
const prev = {};       // previous frame
const pressedAt = {};  // action -> performance.now() when it went down
for (const a of ACTIONS) { state[a] = false; prev[a] = false; pressedAt[a] = -1e9; }

export let keys = JSON.parse(JSON.stringify(DEFAULT_KEYS));
export let device = 'keyboard';   // 'keyboard' | 'gamepad'
export let padStyle = 'xbox';     // 'xbox' | 'playstation' | 'nintendo'

const listeners = new Set();
export function onDeviceChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setDevice(d) {
  if (d === device) return;
  device = d;
  for (const fn of listeners) fn(d);
}

export function setBindings(next) {
  keys = next;
}
export function resetBindings() { keys = JSON.parse(JSON.stringify(DEFAULT_KEYS)); }

/** Which action(s) a physical key is currently bound to. */
function actionsFor(code) {
  const out = [];
  for (const a of ACTIONS) if (keys[a] && keys[a].includes(code)) out.push(a);
  return out;
}

const rawKeys = new Set();
let captureFn = null;

// Virtual buttons, driven by the on-screen touch pad. They feed the same
// action table as keys and pads, so every menu, prompt and gameplay state
// works from touch without knowing touch exists.
const virtual = new Set();
// A tap can begin and end inside a single 60Hz frame, so releasing immediately
// would mean poll() never observes the press and the button appears dead. Any
// press is therefore held until exactly one poll has seen it.
const pressedSincePoll = new Set();
const releaseAfterPoll = new Set();

export function setVirtual(action, on) {
  if (on) {
    if (!virtual.has(action)) setDevice('touch');
    virtual.add(action);
    pressedSincePoll.add(action);
    releaseAfterPoll.delete(action);
  } else if (pressedSincePoll.has(action)) {
    releaseAfterPoll.add(action);      // let this frame's poll see it first
  } else {
    virtual.delete(action);
  }
}
export function clearVirtual() {
  for (const a of virtual) {
    if (pressedSincePoll.has(a)) releaseAfterPoll.add(a);
    else virtual.delete(a);
  }
}
export function virtualDown(action) { return virtual.has(action); }

addEventListener('keydown', (e) => {
  if (captureFn) {
    e.preventDefault();
    const fn = captureFn; captureFn = null;
    fn(e.code);
    return;
  }
  if (!e.repeat) setDevice('keyboard');
  rawKeys.add(e.code);
  // stop the browser scrolling / tabbing away from the game
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
});
addEventListener('keyup', (e) => rawKeys.delete(e.code));
addEventListener('blur', () => rawKeys.clear());

/** Wait for the next key press and hand it back, for the rebinding screen. */
export function captureKey(fn) { captureFn = fn; }
export function isCapturing() { return !!captureFn; }
export function cancelCapture() { captureFn = null; }

function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let any = null;
  for (const p of pads) if (p && p.connected) { any = p; break; }
  if (!any) return null;
  const id = (any.id || '').toLowerCase();
  if (/dualshock|dualsense|playstation|wireless controller/.test(id)) padStyle = 'playstation';
  else if (/nintendo|switch|joy-con|pro controller/.test(id)) padStyle = 'nintendo';
  else padStyle = 'xbox';
  return any;
}

export function poll() {
  for (const a of ACTIONS) prev[a] = state[a];

  const next = {};
  for (const a of ACTIONS) next[a] = false;
  for (const code of rawKeys) for (const a of actionsFor(code)) next[a] = true;
  for (const a of virtual) next[a] = true;

  const pad = pollPad();
  if (pad) {
    let padActive = false;
    for (const [a, idxs] of Object.entries(DEFAULT_PADS)) {
      for (const i of idxs) {
        const b = pad.buttons[i];
        if (b && (b.pressed || b.value > 0.5)) { next[a] = true; padActive = true; }
      }
    }
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    if (ax < -0.4) { next.left = true; padActive = true; }
    if (ax > 0.4) { next.right = true; padActive = true; }
    if (ay < -0.5) { next.up = true; padActive = true; }
    if (ay > 0.5) { next.down = true; padActive = true; }
    if (padActive) setDevice('gamepad');
  }

  const now = performance.now();
  for (const a of ACTIONS) {
    if (next[a] && !state[a]) pressedAt[a] = now;
    state[a] = next[a];
  }

  // this poll has now observed every virtual press, so short taps can retire
  for (const a of releaseAfterPoll) virtual.delete(a);
  releaseAfterPoll.clear();
  pressedSincePoll.clear();
}

export function down(a) { return !!state[a]; }
export function pressed(a) { return !!state[a] && !prev[a]; }
export function released(a) { return !state[a] && !!prev[a]; }
/** Milliseconds since the action last went down; used for the jump buffer. */
export function sincePressed(a) { return performance.now() - pressedAt[a]; }
/** Consume a buffered press so it cannot fire twice. */
export function consume(a) { pressedAt[a] = -1e9; }

export function axisX() { return (down('right') ? 1 : 0) - (down('left') ? 1 : 0); }

/** Human-readable glyph for an action, in the current device's language. */
const PAD_GLYPHS = {
  xbox:        { jump: 'A', attack: 'X', heal: 'Y', interact: 'Y', pause: 'MENU', map: 'VIEW', cancel: 'B' },
  playstation: { jump: 'X', attack: '[]', heal: '/\\', interact: '/\\', pause: 'OPT', map: 'PAD', cancel: 'O' },
  nintendo:    { jump: 'B', attack: 'Y', heal: 'X', interact: 'X', pause: '+', map: '-', cancel: 'A' },
};
const KEY_LABEL = {
  ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN',
  Space: 'SPACE', Enter: 'ENTER', Escape: 'ESC', Tab: 'TAB', Backspace: 'BKSP',
};
export function keyLabel(code) {
  if (!code) return '--';
  if (KEY_LABEL[code]) return KEY_LABEL[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code.toUpperCase();
}
const TOUCH_GLYPHS = {
  jump: 'JUMP', attack: 'HIT', heal: 'MEND', interact: 'USE',
  pause: 'MENU', map: 'ROAD', cancel: 'BACK',
  left: '<', right: '>', up: '^', down: 'v',
};
export function glyph(action) {
  if (device === 'touch') return TOUCH_GLYPHS[action] || '?';
  if (device === 'gamepad') return (PAD_GLYPHS[padStyle] || PAD_GLYPHS.xbox)[action] || '?';
  return keyLabel((keys[action] || [])[0]);
}
