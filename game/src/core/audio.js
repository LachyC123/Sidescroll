// AudioService.
//
// Section 10 is blunt: the collection solves no audio at all, and a fifteen-
// environment game needs a coherent identity rather than a scavenged clip per
// action. Rather than ship sound files under unclear licences, CROWNLESS
// synthesises everything with WebAudio: the whole Section 10 SFX inventory and
// a Crown Bell motif that changes instrument per act.
//
// Buses: master -> {music, sfx, ambience}. Voice count is capped per the
// Section 11 budget (24-32) with player and enemy tells prioritised.

import { settings } from './settings.js';

let ctx = null;
let master = null, busMusic = null, busSfx = null, busAmb = null;
let started = false;
let voices = 0;
const MAX_VOICES = 28;

export function ready() { return started; }

/** Must be called from a user gesture. Safe to call repeatedly. */
export function start() {
  if (started) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  busMusic = ctx.createGain();
  busSfx = ctx.createGain();
  busAmb = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.004;
  busMusic.connect(master); busSfx.connect(master); busAmb.connect(master);
  master.connect(comp); comp.connect(ctx.destination);
  started = true;
  applyVolumes();
  if (ctx.state === 'suspended') ctx.resume();
}

export function applyVolumes() {
  if (!started) return;
  const a = settings.audio;
  master.gain.value = a.master;
  busMusic.gain.value = a.music;
  busSfx.gain.value = a.sfx;
  busAmb.gain.value = a.ambience;
}

function now() { return ctx.currentTime; }

function claimVoice(dur) {
  if (voices >= MAX_VOICES) return false;
  voices++;
  setTimeout(() => { voices--; }, dur * 1000 + 60);
  return true;
}

// ------------------------------------------------------------------ primitives
let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  return s;
}

function env(node, bus, { a = 0.005, d = 0.08, s = 0, r = 0.05, peak = 1 }, t0) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + a);
  if (s > 0) {
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * s), t0 + a + d);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d + r);
  } else {
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  node.connect(g); g.connect(bus);
  return g;
}

function tone({ freq = 440, to = null, type = 'square', bus = null, gain = 0.2,
                a = 0.004, d = 0.1, s = 0, r = 0.05, detune = 0, glide = 0.08 }) {
  if (!started) return;
  const dur = a + d + r + 0.05;
  if (!claimVoice(dur)) return;
  const t0 = now();
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + glide);
  o.detune.value = detune;
  env(o, bus || busSfx, { a, d, s, r, peak: gain }, t0);
  o.start(t0); o.stop(t0 + dur);
}

function hit({ cut = 2400, q = 1, gain = 0.25, d = 0.09, type = 'lowpass', bus = null,
               sweepTo = null }) {
  if (!started) return;
  const dur = d + 0.1;
  if (!claimVoice(dur)) return;
  const t0 = now();
  const n = noise();
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(cut, t0); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t0 + d);
  n.connect(f);
  env(f, bus || busSfx, { a: 0.002, d, peak: gain }, t0);
  n.start(t0); n.stop(t0 + dur);
}

// ------------------------------------------------------------- SFX inventory
// Section 10's required list, grouped exactly as the plan groups it.
const SFX = {
  // player
  step_grass:  () => hit({ cut: 1200, gain: 0.06, d: 0.05, sweepTo: 500 }),
  step_stone:  () => hit({ cut: 2600, gain: 0.07, d: 0.04, sweepTo: 900 }),
  step_water:  () => hit({ cut: 900, gain: 0.08, d: 0.09, sweepTo: 300 }),
  step_mud:    () => hit({ cut: 500, gain: 0.09, d: 0.11, sweepTo: 160 }),
  jump:        () => tone({ freq: 300, to: 620, type: 'square', gain: 0.1, d: 0.09 }),
  land_light:  () => hit({ cut: 900, gain: 0.1, d: 0.06, sweepTo: 260 }),
  land_heavy:  () => { hit({ cut: 700, gain: 0.2, d: 0.14, sweepTo: 130 });
                       tone({ freq: 120, to: 60, type: 'sine', gain: 0.18, d: 0.14 }); },
  attack1:     () => hit({ cut: 3800, q: 2, gain: 0.14, d: 0.08, type: 'bandpass', sweepTo: 1400 }),
  attack2:     () => { hit({ cut: 2600, q: 3, gain: 0.2, d: 0.13, type: 'bandpass', sweepTo: 800 });
                       tone({ freq: 210, to: 90, type: 'sawtooth', gain: 0.1, d: 0.12 }); },
  hurt:        () => { tone({ freq: 380, to: 150, type: 'square', gain: 0.2, d: 0.16 });
                       hit({ cut: 1600, gain: 0.14, d: 0.1, sweepTo: 400 }); },
  heal:        () => { tone({ freq: 520, to: 780, type: 'triangle', gain: 0.16, d: 0.3, glide: 0.28 });
                       tone({ freq: 780, to: 1170, type: 'sine', gain: 0.09, d: 0.36, glide: 0.34 }); },
  death:       () => { tone({ freq: 260, to: 60, type: 'sawtooth', gain: 0.22, d: 0.7, glide: 0.65 });
                       hit({ cut: 1200, gain: 0.16, d: 0.5, sweepTo: 120 }); },
  pickup:      () => { tone({ freq: 880, type: 'triangle', gain: 0.12, d: 0.07 });
                       setTimeout(() => tone({ freq: 1320, type: 'triangle', gain: 0.1, d: 0.1 }), 55); },
  // combat
  whoosh:      () => hit({ cut: 1800, q: 1.4, gain: 0.09, d: 0.11, type: 'bandpass', sweepTo: 600 }),
  impact_flesh: () => hit({ cut: 700, gain: 0.22, d: 0.1, sweepTo: 180 }),
  impact_armour: () => { hit({ cut: 4200, q: 4, gain: 0.18, d: 0.09, type: 'bandpass' });
                         tone({ freq: 1400, to: 900, type: 'square', gain: 0.07, d: 0.1 }); },
  impact_stone: () => hit({ cut: 2200, gain: 0.18, d: 0.08, sweepTo: 600 }),
  block:       () => { hit({ cut: 5200, q: 6, gain: 0.2, d: 0.1, type: 'bandpass' });
                       tone({ freq: 2100, to: 1500, type: 'square', gain: 0.06, d: 0.12 }); },
  enemy_death: () => { tone({ freq: 300, to: 90, type: 'square', gain: 0.16, d: 0.28, glide: 0.26 });
                       hit({ cut: 900, gain: 0.14, d: 0.24, sweepTo: 150 }); },
  elite_cue:   () => { tone({ freq: 160, to: 110, type: 'sawtooth', gain: 0.2, d: 0.5, glide: 0.45 });
                       tone({ freq: 240, type: 'square', gain: 0.08, d: 0.4 }); },
  final_hit:   () => { hit({ cut: 1400, gain: 0.3, d: 0.22, sweepTo: 160 });
                       tone({ freq: 90, to: 45, type: 'sine', gain: 0.25, d: 0.3, glide: 0.28 }); },
  // world
  waystone:    () => bell(523.25, 0.9, 0.24),
  save:        () => { bell(659.25, 0.5, 0.14); setTimeout(() => bell(987.77, 0.7, 0.1), 120); },
  door:        () => { hit({ cut: 500, gain: 0.16, d: 0.3, sweepTo: 120 });
                       tone({ freq: 80, to: 50, type: 'sine', gain: 0.12, d: 0.35, glide: 0.3 }); },
  lever:       () => { hit({ cut: 3200, q: 3, gain: 0.14, d: 0.06, type: 'bandpass' });
                       setTimeout(() => tone({ freq: 220, type: 'square', gain: 0.1, d: 0.09 }), 70); },
  breakable:   () => { hit({ cut: 2800, gain: 0.24, d: 0.18, sweepTo: 400 }); },
  lift:        () => tone({ freq: 60, type: 'sawtooth', gain: 0.08, d: 0.5, s: 0.6, r: 0.3 }),
  minecart:    () => hit({ cut: 1600, q: 2, gain: 0.1, d: 0.4, type: 'bandpass', sweepTo: 900 }),
  splash:      () => hit({ cut: 2400, gain: 0.16, d: 0.2, sweepTo: 300 }),
  mud:         () => hit({ cut: 400, gain: 0.14, d: 0.2, sweepTo: 110 }),
  wind_gust:   () => hit({ cut: 700, q: 0.6, gain: 0.11, d: 0.9, type: 'bandpass', sweepTo: 1500 }),
  // ui
  ui_move:     () => tone({ freq: 620, type: 'square', gain: 0.06, d: 0.035 }),
  ui_confirm:  () => { tone({ freq: 700, type: 'square', gain: 0.08, d: 0.05 });
                       setTimeout(() => tone({ freq: 1050, type: 'square', gain: 0.07, d: 0.07 }), 45); },
  ui_cancel:   () => tone({ freq: 420, to: 280, type: 'square', gain: 0.08, d: 0.09 }),
  ui_invalid:  () => tone({ freq: 180, type: 'square', gain: 0.09, d: 0.11 }),
  ui_tab:      () => tone({ freq: 520, to: 640, type: 'triangle', gain: 0.07, d: 0.06 }),
  chapter:     () => { bell(392, 1.2, 0.2); setTimeout(() => bell(587.33, 1.4, 0.16), 260); },
  // enemy tells
  tell_charge: () => tone({ freq: 140, to: 260, type: 'sawtooth', gain: 0.14, d: 0.26, glide: 0.24 }),
  tell_swing:  () => tone({ freq: 520, to: 300, type: 'triangle', gain: 0.1, d: 0.16, glide: 0.14 }),
  tell_boss:   () => { tone({ freq: 110, to: 220, type: 'sawtooth', gain: 0.22, d: 0.45, glide: 0.4 });
                       hit({ cut: 500, gain: 0.14, d: 0.4, sweepTo: 1400 }); },
  secret:      () => { bell(880, 0.6, 0.11); setTimeout(() => bell(1174.66, 0.8, 0.09), 110); },
};

/** A struck bell: a few inharmonic partials with a long tail. The game's motif. */
function bell(f, len = 1.0, gain = 0.2, bus = null) {
  if (!started) return;
  if (!claimVoice(len)) return;
  const t0 = now();
  const partials = [1, 2.01, 2.98, 4.17, 5.43];
  const amps = [1, 0.55, 0.38, 0.22, 0.13];
  partials.forEach((p, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f * p;
    const g = ctx.createGain();
    const peak = gain * amps[i];
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len * (1 - i * 0.11));
    o.connect(g); g.connect(bus || busSfx);
    o.start(t0); o.stop(t0 + len + 0.1);
  });
}

export function sfx(name, opts = {}) {
  if (!started || !SFX[name]) return;
  if (opts.volume === 0) return;
  SFX[name]();
}
export const SFX_NAMES = Object.keys(SFX);

// ---------------------------------------------------------------------- music
// One Crown Bell motif, re-voiced per act (Section 10). Exploration tracks
// loop cleanly; combat adds a percussion layer rather than hard-cutting.

const MOTIF = [0, 3, 7, 10, 7, 3];   // semitone offsets: the Crown Bell shape
const ACT_VOICE = {
  1: { wave: 'triangle', root: 261.63, tempo: 2600, bellMix: 0.9, pad: 'sine' },
  2: { wave: 'sine',     root: 233.08, tempo: 3000, bellMix: 0.7, pad: 'triangle' },
  3: { wave: 'square',   root: 196.00, tempo: 2200, bellMix: 0.5, pad: 'sawtooth' },
  4: { wave: 'sawtooth', root: 174.61, tempo: 2000, bellMix: 0.8, pad: 'square' },
  5: { wave: 'square',   root: 146.83, tempo: 1700, bellMix: 1.0, pad: 'sawtooth' },
};

let musicTimer = null, musicStep = 0, musicAct = 1, combatLayer = false, musicOn = true;
let padNode = null, padGain = null;

function semis(root, n) { return root * Math.pow(2, n / 12); }

function musicTick() {
  if (!started || !musicOn) return;
  const v = ACT_VOICE[musicAct] || ACT_VOICE[1];
  const n = MOTIF[musicStep % MOTIF.length];
  const oct = musicStep % (MOTIF.length * 2) >= MOTIF.length ? 12 : 0;
  const f = semis(v.root, n + oct);

  if (Math.random() < v.bellMix) bell(f * 2, 1.6, 0.055, busMusic);
  tone({ freq: f, type: v.wave, gain: 0.045, a: 0.02, d: 0.5, s: 0.35, r: 0.5, bus: busMusic });
  // harmony a fifth below on the phrase turn
  if (musicStep % MOTIF.length === 0) {
    tone({ freq: semis(v.root, n - 5), type: v.pad, gain: 0.03,
           a: 0.15, d: 0.9, s: 0.4, r: 0.8, bus: busMusic });
  }
  if (combatLayer) {
    hit({ cut: 3000, q: 1.5, gain: 0.05, d: 0.05, type: 'bandpass', bus: busMusic });
    if (musicStep % 2 === 1) hit({ cut: 220, gain: 0.09, d: 0.08, bus: busMusic });
  }
  musicStep++;
}

export function setAct(act) {
  if (musicAct === act) return;
  musicAct = act;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; startMusic(); }
}

export function startMusic() {
  if (!started || musicTimer) return;
  musicOn = true;
  const v = ACT_VOICE[musicAct] || ACT_VOICE[1];
  musicTick();
  musicTimer = setInterval(musicTick, v.tempo / MOTIF.length);
}

export function stopMusic() {
  musicOn = false;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

export function setCombat(on) { combatLayer = on; }

/** Quiet rooms are allowed ambience only (Section 10). */
export function setAmbience(kind) {
  if (!started) return;
  if (padNode) { try { padNode.stop(); } catch { /* already stopped */ } padNode = null; }
  if (!kind) return;
  const t0 = now();
  const n = noise();
  const f = ctx.createBiquadFilter();
  const cfg = {
    forest: { type: 'bandpass', freq: 900, q: 0.5, g: 0.035 },
    cave:   { type: 'lowpass', freq: 320, q: 0.8, g: 0.05 },
    water:  { type: 'bandpass', freq: 1400, q: 0.4, g: 0.045 },
    wind:   { type: 'bandpass', freq: 600, q: 0.3, g: 0.06 },
    hall:   { type: 'lowpass', freq: 500, q: 1.2, g: 0.03 },
  }[kind] || { type: 'lowpass', freq: 600, q: 1, g: 0.03 };
  f.type = cfg.type; f.frequency.value = cfg.freq; f.Q.value = cfg.q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(cfg.g, t0 + 1.2);
  n.connect(f); f.connect(g); g.connect(busAmb);
  n.start(t0);
  padNode = n; padGain = g;
}

/** Restoring a waystone briefly resolves the region's harmony (Section 10). */
export function waystoneResolve() {
  if (!started) return;
  const v = ACT_VOICE[musicAct] || ACT_VOICE[1];
  [0, 4, 7, 12].forEach((n, i) => {
    setTimeout(() => bell(semis(v.root, n) * 2, 2.2, 0.09, busMusic), i * 140);
  });
}
