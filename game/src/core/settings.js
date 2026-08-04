// SettingsService. Kept in its own storage key so deleting a save slot never
// takes the player's controls and accessibility choices with it (Section 11).

import { DEFAULT_KEYS, setBindings, resetBindings } from './input.js';
import { fxScale, setPreferInteger } from './screen.js';

const KEY = 'crownless.settings';

export const DEFAULTS = {
  video: { integerScale: true, showFps: false, touchControls: null },
  audio: { master: 0.8, music: 0.7, sfx: 0.9, ambience: 0.6 },
  gameplay: { holdToRun: false, autoHeal: false, tutorialPrompts: true },
  accessibility: {
    shake: 1.0,          // 0..1 multiplier
    flash: 1.0,
    hitStop: 1.0,
    textSpeed: 1.0,      // 0.5 slow .. 2 instant
    instantText: false,
    highContrast: false,
    telegraphBoost: false,   // enemy tells get an extra outline pulse
    photosensitiveSafe: false,
    holdToggleHeal: false,
  },
  assists: {
    damageTaken: 1.0,    // 0.5 .. 1.0
    extraGrace: 0,       // extra ms of invulnerability
    slowHazards: false,
    checkpointHeal: true,
  },
  controls: { keys: null },   // null = defaults
};

function deepMerge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(over || {})) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k]) {
      out[k] = deepMerge(base[k], over[k]);
    } else if (over[k] !== undefined) {
      out[k] = over[k];
    }
  }
  return out;
}

export let settings = JSON.parse(JSON.stringify(DEFAULTS));

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) settings = deepMerge(DEFAULTS, JSON.parse(raw));
  } catch { settings = JSON.parse(JSON.stringify(DEFAULTS)); }
  apply();
  return settings;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* full or blocked */ }
}

/** Push settings into the services that consume them. Safe to call often. */
export function apply() {
  const a = settings.accessibility;
  fxScale.shake = a.photosensitiveSafe ? 0 : a.shake;
  fxScale.flash = a.photosensitiveSafe ? 0 : a.flash;
  setPreferInteger(settings.video.integerScale);
  if (settings.controls.keys) setBindings(settings.controls.keys);
  else resetBindings();
}

export function resetAll() {
  settings = JSON.parse(JSON.stringify(DEFAULTS));
  apply();
  save();
}

export function bindingsForEdit() {
  if (!settings.controls.keys) {
    settings.controls.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS));
  }
  return settings.controls.keys;
}
