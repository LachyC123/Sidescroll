// Every screen in the Section 9 inventory: boot, title, save slots, pause,
// road, vows, settings, accessibility, death, chapter complete and credits.
// All of them are keyboard- and gamepad-navigable; none of them needs a mouse.

import * as In from '../core/input.js';
import { W, H, clear } from '../core/screen.js';
import { text, textWidth, textBlock, CH_H } from '../core/text.js';
import { sfx, startMusic, stopMusic, applyVolumes } from '../core/audio.js';
import { settings, save as saveSettings, apply as applySettings, resetAll, bindingsForEdit }
  from '../core/settings.js';
import { SLOTS, AUTOSAVE_SLOT, slotSummary, formatTime, deleteSlot, mostRecentSlot }
  from '../core/save.js';
import { Menu, PAL, panel, title, footer, tabs } from './menu.js';
import { CHAPTERS, BY_ID } from '../game/chapters.js';
import { VOWS, CRESTS, DIFFICULTIES, vowUpgradeCost } from '../game/tuning.js';

// --------------------------------------------------------------------- boot
export class BootScreen {
  constructor(flow) {
    this.flow = flow;
    this.t = 0;
    this.seen = localStorage.getItem('crownless.bootseen') === '1';
  }
  update(dt) {
    this.t += dt;
    const skippable = this.t > 0.5;
    if ((this.seen && this.t > 0.6) || (skippable && (In.pressed('attack') || In.pressed('jump')))) {
      localStorage.setItem('crownless.bootseen', '1');
      this.flow.go('title');
    }
    if (this.t > 5.5) { localStorage.setItem('crownless.bootseen', '1'); this.flow.go('title'); }
  }
  draw(ctx) {
    clear(PAL.bg);
    const a = Math.min(1, this.t * 1.4) * (this.t > 4.8 ? Math.max(0, (5.5 - this.t) / 0.7) : 1);
    ctx.globalAlpha = a;
    text(ctx, 'A GAME BUILT FROM', W / 2, 78, { align: 'centre', colour: PAL.faint });
    text(ctx, 'ANOKOLISA\'S LEGACY FANTASY', W / 2, 90, { align: 'centre', colour: PAL.dim });
    text(ctx, 'COLLECTION', W / 2, 100, { align: 'centre', colour: PAL.dim });
    // Section 9: photosensitivity notice before gameplay, reachable early
    text(ctx, 'CONTAINS FLASHING EFFECTS AND SCREEN SHAKE.', W / 2, 128,
         { align: 'centre', colour: PAL.faint });
    text(ctx, 'BOTH CAN BE REDUCED OR DISABLED IN ACCESSIBILITY.', W / 2, 138,
         { align: 'centre', colour: PAL.faint });
    if (this.t > 0.6) {
      text(ctx, `${In.glyph('attack')} SKIP`, W / 2, H - 20, { align: 'centre', colour: PAL.faint });
    }
    ctx.globalAlpha = 1;
  }
}

// -------------------------------------------------------------------- title
export class TitleScreen {
  constructor(flow) {
    this.flow = flow;
    this.t = 0;
    const recent = mostRecentSlot();
    this.recent = recent;
    this.menu = new Menu('title', [
      { label: 'CONTINUE', disabled: !recent,
        hint: recent ? `${chapterName(recent.chapter)}  ${formatTime(recent.play_time)}`
                     : 'No journey has been started yet.',
        onSelect: () => flow.continueGame(recent.slot) },
      { label: 'NEW GAME', hint: 'Begin the road at the High Forest.',
        onSelect: () => flow.go('newgame') },
      { label: 'LOAD', hint: 'Choose one of three save slots.',
        onSelect: () => flow.go('slots') },
      { label: 'SETTINGS', hint: 'Video, audio, controls and gameplay.',
        onSelect: () => flow.go('settings') },
      { label: 'ACCESSIBILITY', hint: 'Shake, flash, hit-stop, text and assists.',
        onSelect: () => flow.go('access') },
      { label: 'CREDITS', hint: 'Art, tools, code and licences.',
        onSelect: () => flow.go('credits') },
    ]);
  }
  update(dt) { this.t += dt; this.menu.update(dt); }
  draw(ctx) {
    clear('#0a0812');
    // a quiet composed title plate rather than a logo asset
    for (let i = 0; i < 60; i++) {
      const x = (i * 137) % W, y = (i * 71) % 70;
      ctx.fillStyle = i % 5 ? '#161226' : '#221c33';
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.fillStyle = '#12101c';
    ctx.fillRect(0, 72, W, 2);
    text(ctx, 'CROWNLESS', W / 2, 34, { align: 'centre', colour: PAL.ink, shadow: '#000' });
    text(ctx, 'LEGACY FANTASY', W / 2, 48, { align: 'centre', colour: PAL.accent });
    text(ctx, 'THE ROYAL ROAD HAS BEEN SEVERED.', W / 2, 60,
         { align: 'centre', colour: PAL.faint });

    this.menu.draw(ctx, W / 2 - 60, 88, { width: 120, lineHeight: 13,
      hintY: 170, hintX: 28, hintW: W - 56 });
    footer(ctx, [['attack', 'SELECT'], ['cancel', 'BACK']]);
    text(ctx, In.device === 'gamepad' ? 'GAMEPAD' : 'KEYBOARD', W - 6, 6,
         { align: 'right', colour: PAL.faint });
  }
}

function chapterName(id) {
  const c = BY_ID[id];
  return c ? `CH ${c.num} ${c.name}` : id;
}

// ----------------------------------------------------------------- new game
export class NewGameScreen {
  constructor(flow) {
    this.flow = flow;
    this.diff = 'wayfarer';
    const keys = Object.keys(DIFFICULTIES);
    this.menu = new Menu('newgame', [
      { label: 'DIFFICULTY', kind: 'choice',
        value: () => DIFFICULTIES[this.diff].name,
        hint: () => DIFFICULTIES[this.diff].blurb,
        onChange: (d) => {
          const i = keys.indexOf(this.diff);
          this.diff = keys[(i + d + keys.length) % keys.length];
          this.menu.items[0].hint = DIFFICULTIES[this.diff].blurb;
        },
        onSelect: () => {} },
      { separator: true },
      { label: 'CHOOSE A SLOT', onSelect: () => flow.go('slots', { mode: 'new', diff: this.diff }) },
      { label: 'BACK', onSelect: () => flow.go('title') },
    ], { onCancel: () => flow.go('title') });
    this.menu.items[0].hint = DIFFICULTIES[this.diff].blurb;
  }
  update(dt) { this.menu.update(dt); }
  draw(ctx) {
    clear(PAL.bg);
    title(ctx, 'NEW GAME', 20);
    panel(ctx, 40, 40, W - 80, 78);
    this.menu.draw(ctx, 52, 52, { width: W - 104, lineHeight: 13,
      hintY: 126, hintX: 40, hintW: W - 80 });
    text(ctx, 'DIFFICULTY ASSISTS CAN BE CHANGED AT ANY TIME.', W / 2, 160,
         { align: 'centre', colour: PAL.faint });
    footer(ctx, [['attack', 'SELECT'], ['cancel', 'BACK']]);
  }
}

// ------------------------------------------------------------------- slots
export class SlotScreen {
  constructor(flow, args = {}) {
    this.flow = flow;
    this.mode = args.mode || 'load';
    this.diff = args.diff || 'wayfarer';
    this.confirmDelete = null;
    this.rebuild();
  }
  rebuild() {
    const items = [];
    const all = this.mode === 'new' ? SLOTS : [AUTOSAVE_SLOT, ...SLOTS];
    for (const s of all) {
      const sum = slotSummary(s);
      const empty = sum.state === 'empty';
      const bad = sum.state === 'corrupt' || sum.state === 'unavailable';
      const name = s === AUTOSAVE_SLOT ? 'AUTOSAVE' : 'SLOT ' + s;
      items.push({
        label: name,
        value: () => bad ? 'UNREADABLE' : empty ? 'EMPTY' : `CH ${BY_ID[sum.chapter]?.num ?? '?'}`,
        disabled: this.mode === 'load' && (empty || bad),
        sum, slot: s,
        hint: bad ? 'This slot could not be read. It has been left untouched rather than erased.'
             : empty ? (this.mode === 'new' ? 'Start a new journey here.' : 'Nothing saved yet.')
             : `${chapterName(sum.chapter)}   ${formatTime(sum.play_time)}   `
               + `${sum.health}/${sum.max_health} HEALTH   ${DIFFICULTIES[sum.difficulty]?.name || ''}`,
        onSelect: () => {
          if (this.mode === 'new') {
            if (!empty) { this.confirmDelete = { slot: s, overwrite: true }; return; }
            this.flow.newGame(s, this.diff);
          } else {
            this.flow.continueGame(s);
          }
        },
      });
    }
    items.push({ separator: true });
    items.push({ label: 'BACK', onSelect: () => this.flow.go(this.mode === 'new' ? 'newgame' : 'title') });
    this.menu = new Menu('slots', items, { onCancel: () => this.flow.go(this.mode === 'new' ? 'newgame' : 'title') });
  }
  update(dt) {
    if (this.confirmDelete) {
      if (In.pressed('attack')) {
        sfx('ui_confirm');
        const c = this.confirmDelete;
        this.confirmDelete = null;
        if (c.overwrite) { deleteSlot(c.slot); this.flow.newGame(c.slot, this.diff); }
        else { deleteSlot(c.slot); this.rebuild(); }
      } else if (In.pressed('cancel') || In.pressed('pause')) {
        sfx('ui_cancel'); this.confirmDelete = null;
      }
      return;
    }
    // delete is deliberately on a separate action, never the confirm button
    if (In.pressed('heal')) {
      const it = this.menu.current;
      if (it && it.slot !== undefined && it.sum.state !== 'empty') {
        sfx('ui_tab');
        this.confirmDelete = { slot: it.slot, overwrite: false };
      } else sfx('ui_invalid');
    }
    this.menu.update(dt);
  }
  draw(ctx) {
    clear(PAL.bg);
    title(ctx, this.mode === 'new' ? 'CHOOSE A SLOT' : 'LOAD', 18);
    panel(ctx, 26, 38, W - 52, 96);
    this.menu.draw(ctx, 38, 48, { width: W - 76, lineHeight: 13,
      hintY: 142, hintX: 26, hintW: W - 52 });
    footer(ctx, [['attack', 'SELECT'], ['heal', 'DELETE'], ['cancel', 'BACK']]);

    if (this.confirmDelete) {
      panel(ctx, 62, 74, W - 124, 62, { fill: 'rgba(6,4,10,0.97)' });
      const c = this.confirmDelete;
      text(ctx, c.overwrite ? 'OVERWRITE THIS SLOT?' : 'DELETE THIS SLOT?', W / 2, 86,
           { align: 'centre', colour: PAL.danger });
      text(ctx, 'THIS CANNOT BE UNDONE.', W / 2, 100, { align: 'centre', colour: PAL.dim });
      text(ctx, `${In.glyph('attack')} CONFIRM    ${In.glyph('cancel')} CANCEL`, W / 2, 118,
           { align: 'centre', colour: PAL.ink });
    }
  }
}

// -------------------------------------------------------------------- pause
export class PauseScreen {
  constructor(flow, args) {
    this.flow = flow;
    this.world = args.world;
    this.tab = 0;
    this.tabs = ['RESUME', 'ROAD', 'VOWS', 'JOURNAL', 'SETTINGS', 'QUIT'];
    this.buildTab();
  }
  buildTab() {
    const flow = this.flow, world = this.world;
    const save = flow.save;
    switch (this.tab) {
      case 0:
        this.menu = new Menu('pause.resume', [
          { label: 'RESUME', onSelect: () => flow.resume() },
          { label: 'RETURN TO TITLE', hint: 'Progress since the last waystone is not kept.',
            onSelect: () => flow.confirmQuitToTitle() },
        ], { onCancel: () => flow.resume() });
        break;
      case 1: this.menu = null; break;
      case 2: this.buildVows(); break;
      case 3: this.menu = null; break;
      case 4:
        this.menu = new Menu('pause.settings', [
          { label: 'SETTINGS', onSelect: () => flow.go('settings', { from: 'pause' }) },
          { label: 'ACCESSIBILITY', onSelect: () => flow.go('access', { from: 'pause' }) },
          { label: 'CONTROLS', onSelect: () => flow.go('controls', { from: 'pause' }) },
        ], { onCancel: () => flow.resume() });
        break;
      case 5:
        this.menu = new Menu('pause.quit', [
          { label: 'RETURN TO TITLE', onSelect: () => flow.confirmQuitToTitle() },
          { label: 'BACK', onSelect: () => { this.tab = 0; this.buildTab(); } },
        ], { onCancel: () => flow.resume() });
        break;
    }
  }
  buildVows() {
    const p = this.world.player;
    const ids = Object.keys(VOWS);
    const items = [];
    for (let slot = 0; slot < 3; slot++) {
      const cur = p.vows[slot];
      items.push({
        label: `SLOT ${slot + 1}`, kind: 'choice',
        value: () => (p.vows[slot]
          ? VOWS[p.vows[slot]].name.replace(/^vow of /i, '') : 'EMPTY'),
        hint: () => '',
        onChange: (d) => {
          const avail = [null, ...ids.filter((v) => !p.vows.includes(v) || p.vows[slot] === v)];
          const i = avail.indexOf(p.vows[slot]);
          p.vows[slot] = avail[(i + d + avail.length) % avail.length];
          this.buildVows();
        },
        onSelect: () => {},
      });
    }
    items.push({ separator: true });
    const crests = Object.keys(CRESTS);
    items.push({
      label: 'SWORD CREST', kind: 'choice',
      value: () => CRESTS[p.crest].name,
      onChange: (d) => {
        const i = crests.indexOf(p.crest);
        p.crest = crests[(i + d + crests.length) % crests.length];
      },
      onSelect: () => {},
    });
    this.menu = new Menu('pause.vows', items, { onCancel: () => this.flow.resume() });
  }
  update(dt) {
    if (In.pressed('map')) { sfx('ui_tab'); this.tab = (this.tab + 1) % this.tabs.length; this.buildTab(); return; }
    if (!this.menu) {
      if (In.pressed('cancel') || In.pressed('pause')) { sfx('ui_cancel'); this.flow.resume(); }
      if (In.pressed('left')) { sfx('ui_tab'); this.tab = (this.tab + this.tabs.length - 1) % this.tabs.length; this.buildTab(); }
      if (In.pressed('right')) { sfx('ui_tab'); this.tab = (this.tab + 1) % this.tabs.length; this.buildTab(); }
      return;
    }
    // left/right switch tabs unless the focused item consumes them
    const it = this.menu.current;
    const consumes = it && (it.kind === 'slider' || it.kind === 'choice');
    if (!consumes) {
      if (In.pressed('left')) { sfx('ui_tab'); this.tab = (this.tab + this.tabs.length - 1) % this.tabs.length; this.buildTab(); return; }
      if (In.pressed('right')) { sfx('ui_tab'); this.tab = (this.tab + 1) % this.tabs.length; this.buildTab(); return; }
    }
    this.menu.update(dt);
  }
  draw(ctx) {
    // gameplay stays visible behind, dimmed
    ctx.fillStyle = 'rgba(6,5,10,0.82)';
    ctx.fillRect(0, 0, W, H);
    tabs(ctx, this.tabs, this.tab, 10);
    panel(ctx, 20, 26, W - 40, H - 52);

    if (this.tab === 1) this.drawRoad(ctx);
    else if (this.tab === 3) this.drawJournal(ctx);
    else if (this.tab === 2) {
      this.menu.draw(ctx, 34, 40, { width: W - 68, lineHeight: 13 });
      const p = this.world.player;
      const cur = p.vows[Math.min(this.menu.i, 2)];
      const v = cur ? VOWS[cur] : null;
      if (v) {
        text(ctx, v.role.toUpperCase(), 34, 108, { colour: PAL.accent });
        textBlock(ctx, v.blurb, 34, 120, W - 68, { colour: PAL.dim });
      } else {
        textBlock(ctx, 'An empty vow slot. Equip up to three; each changes a clear behaviour rather than a small percentage.',
                  34, 108, W - 68, { colour: PAL.dim });
      }
      text(ctx, CRESTS[p.crest].blurb.toUpperCase(), 34, H - 44, { colour: PAL.faint });
    } else {
      this.menu.draw(ctx, 34, 44, { width: W - 68, lineHeight: 13, hintY: 92, hintX: 34, hintW: W - 68 });
    }
    footer(ctx, [['map', 'TAB'], ['attack', 'SELECT'], ['pause', 'RESUME']]);
  }

  drawRoad(ctx) {
    // Section 9: a linear chapter route, not a fake open-world map
    const save = this.flow.save;
    const done = save.progress.completed_chapters;
    const curId = save.progress.current_chapter;
    text(ctx, 'THE ROAD', W / 2, 34, { align: 'centre', colour: PAL.ink });
    const perRow = 8;
    CHAPTERS.forEach((c, i) => {
      const col = i % perRow, row = Math.floor(i / perRow);
      const x = 34 + col * 40, y = 52 + row * 30;
      const isDone = done.includes(c.id);
      const isCur = c.id === curId;
      ctx.fillStyle = isCur ? PAL.accent : isDone ? PAL.dim : PAL.panelEdge;
      ctx.fillRect(x, y, 8, 8);
      if (isDone) { ctx.fillStyle = PAL.bg; ctx.fillRect(x + 2, y + 2, 4, 4); }
      if (col < perRow - 1 && i < CHAPTERS.length - 1) {
        ctx.fillStyle = isDone ? PAL.dim : PAL.panelEdge;
        ctx.fillRect(x + 9, y + 3, 30, 1);
      }
      text(ctx, c.num, x, y + 11, { colour: isCur ? PAL.accent : PAL.faint });
    });
    const cur = BY_ID[curId];
    if (cur) {
      text(ctx, `CH ${cur.num}  ${cur.name}`, 34, 122, { colour: PAL.ink });
      textBlock(ctx, cur.purpose, 34, 134, W - 68, { colour: PAL.dim });
    }
    const frags = save.world.collected_fragment_ids.length;
    text(ctx, `WAYSTONES ${save.world.restored_waystones.length}   FRAGMENTS ${frags}   `
            + `SECRETS ${save.stats.secrets_found}`, 34, H - 44, { colour: PAL.faint });
  }

  drawJournal(ctx) {
    const save = this.flow.save;
    const ch = this.world.ch;
    text(ctx, 'JOURNAL', W / 2, 34, { align: 'centre', colour: PAL.ink });
    text(ctx, ch.name.toUpperCase(), 34, 50, { colour: PAL.accent });
    let y = 62;
    y += textBlock(ctx, ch.intro, 34, y, W - 68, { colour: PAL.ink }) + 6;
    if (ch.bridgeIn) y += textBlock(ctx, ch.bridgeIn, 34, y, W - 68, { colour: PAL.dim }) + 4;
    text(ctx, `TIME ${formatTime(save.profile.play_time)}`, 34, H - 56, { colour: PAL.faint });
    text(ctx, `FELLED ${save.stats.enemies_felled}   DEATHS ${save.stats.deaths}`,
         34, H - 46, { colour: PAL.faint });
  }
}

// ------------------------------------------------------------------ settings
export class SettingsScreen {
  constructor(flow, args = {}) {
    this.flow = flow;
    this.from = args.from || 'title';
    const s = settings;
    const back = () => flow.go(this.from === 'pause' ? 'pause' : 'title');
    const slider = (label, get, set, hint) => ({
      label, kind: 'slider', get,
      value: () => Math.round(get() * 100) + '%',
      onChange: (d) => { set(Math.max(0, Math.min(1, get() + d * 0.05))); saveSettings(); applyVolumes(); },
      onSelect: () => {}, hint,
    });
    this.menu = new Menu('settings', [
      { label: 'AUDIO', separator: false, disabled: true },
      slider('MASTER', () => s.audio.master, (v) => s.audio.master = v),
      slider('MUSIC', () => s.audio.music, (v) => s.audio.music = v),
      slider('EFFECTS', () => s.audio.sfx, (v) => s.audio.sfx = v),
      slider('AMBIENCE', () => s.audio.ambience, (v) => s.audio.ambience = v),
      { separator: true },
      { label: 'SHOW FPS', kind: 'choice', value: () => s.video.showFps ? 'ON' : 'OFF',
        onChange: () => { s.video.showFps = !s.video.showFps; saveSettings(); },
        onSelect: () => { s.video.showFps = !s.video.showFps; saveSettings(); } },
      { label: 'TUTORIAL PROMPTS', kind: 'choice',
        value: () => s.gameplay.tutorialPrompts ? 'ON' : 'OFF',
        hint: 'Contextual prompts in the opening chapter.',
        onChange: () => { s.gameplay.tutorialPrompts = !s.gameplay.tutorialPrompts; saveSettings(); },
        onSelect: () => { s.gameplay.tutorialPrompts = !s.gameplay.tutorialPrompts; saveSettings(); } },
      { separator: true },
      { label: 'CONTROLS', onSelect: () => flow.go('controls', { from: this.from }) },
      { label: 'ACCESSIBILITY', onSelect: () => flow.go('access', { from: this.from }) },
      { label: 'RESET TO DEFAULTS', onSelect: () => { resetAll(); applyVolumes(); sfx('ui_confirm'); } },
      { label: 'BACK', onSelect: back },
    ], { onCancel: back });
  }
  update(dt) { this.menu.update(dt); }
  draw(ctx) {
    if (this.from === 'pause') { ctx.fillStyle = 'rgba(6,5,10,0.9)'; ctx.fillRect(0, 0, W, H); }
    else clear(PAL.bg);
    title(ctx, 'SETTINGS', 14);
    this.menu.draw(ctx, 40, 32, { width: W - 80, lineHeight: 12,
      hintY: H - 30, hintX: 24, hintW: W - 48 });
    footer(ctx, [['attack', 'SELECT'], ['cancel', 'BACK']]);
  }
}

// ------------------------------------------------------------- accessibility
export class AccessScreen {
  constructor(flow, args = {}) {
    this.flow = flow;
    this.from = args.from || 'title';
    const a = settings.accessibility, as = settings.assists;
    const back = () => flow.go(this.from === 'pause' ? 'pause' : 'title');
    const commit = () => { saveSettings(); applySettings(); };
    const slider = (label, get, set, hint) => ({
      label, kind: 'slider', get, value: () => Math.round(get() * 100) + '%',
      onChange: (d) => { set(Math.max(0, Math.min(1, get() + d * 0.1))); commit(); },
      onSelect: () => {}, hint,
    });
    const toggle = (label, get, set, hint) => ({
      label, kind: 'choice', value: () => get() ? 'ON' : 'OFF', hint,
      onChange: () => { set(!get()); commit(); },
      onSelect: () => { set(!get()); commit(); },
    });
    this.menu = new Menu('access', [
      slider('CAMERA SHAKE', () => a.shake, (v) => a.shake = v,
             'Scales all screen shake. Independent of flashes and hit-stop.'),
      slider('SCREEN FLASH', () => a.flash, (v) => a.flash = v,
             'Scales damage and impact flashes.'),
      slider('HIT-STOP', () => a.hitStop, (v) => a.hitStop = v,
             'Scales the brief freeze on impact. UI never freezes.'),
      toggle('PHOTOSENSITIVE SAFE', () => a.photosensitiveSafe, (v) => a.photosensitiveSafe = v,
             'Disables shake and flash outright, whatever the sliders say.'),
      toggle('ENEMY TELL BOOST', () => a.telegraphBoost, (v) => a.telegraphBoost = v,
             'Adds a high-contrast outline pulse while an enemy winds up.'),
      toggle('INSTANT TEXT', () => a.instantText, (v) => a.instantText = v),
      { separator: true },
      { label: 'DAMAGE TAKEN', kind: 'slider',
        get: () => (as.damageTaken - 0.5) / 0.5,
        value: () => Math.round(as.damageTaken * 100) + '%',
        hint: 'An assist, changeable mid-save. 50% to 100%.',
        onChange: (d) => { as.damageTaken = Math.max(0.5, Math.min(1, as.damageTaken + d * 0.1)); commit(); },
        onSelect: () => {} },
      { label: 'EXTRA GRACE', kind: 'slider',
        get: () => as.extraGrace / 900,
        value: () => as.extraGrace + 'MS',
        hint: 'Extra invulnerability after taking a hit.',
        onChange: (d) => { as.extraGrace = Math.max(0, Math.min(900, as.extraGrace + d * 150)); commit(); },
        onSelect: () => {} },
      toggle('SLOW HAZARDS', () => as.slowHazards, (v) => as.slowHazards = v),
      toggle('HEAL AT WAYSTONES', () => as.checkpointHeal, (v) => as.checkpointHeal = v),
      { separator: true },
      { label: 'BACK', onSelect: back },
    ], { onCancel: back });
  }
  update(dt) { this.menu.update(dt); }
  draw(ctx) {
    if (this.from === 'pause') { ctx.fillStyle = 'rgba(6,5,10,0.9)'; ctx.fillRect(0, 0, W, H); }
    else clear(PAL.bg);
    title(ctx, 'ACCESSIBILITY', 12);
    this.menu.draw(ctx, 40, 28, { width: W - 80, lineHeight: 12,
      hintY: H - 30, hintX: 24, hintW: W - 48 });
    footer(ctx, [['attack', 'TOGGLE'], ['cancel', 'BACK']]);
  }
}

// ------------------------------------------------------------------ controls
export class ControlsScreen {
  constructor(flow, args = {}) {
    this.flow = flow;
    this.from = args.from || 'title';
    this.binding = null;
    this.rebuild();
  }
  rebuild() {
    const keys = bindingsForEdit();
    const back = () => this.flow.go(this.from === 'pause' ? 'pause' : 'settings', { from: this.from });
    const acts = ['left', 'right', 'up', 'down', 'jump', 'attack', 'heal', 'interact', 'pause', 'map'];
    const items = acts.map((a) => ({
      label: a.toUpperCase(),
      value: () => (keys[a] || []).map((k) => In.keyLabel(k)).slice(0, 2).join(' / '),
      hint: 'Press select, then any key to rebind. Gamepad uses a fixed standard layout.',
      onSelect: () => {
        this.binding = a;
        In.captureKey((code) => {
          for (const other of Object.keys(keys)) {
            keys[other] = keys[other].filter((k) => k !== code);
          }
          keys[a] = [code, ...(keys[a] || [])].slice(0, 2);
          settings.controls.keys = keys;
          saveSettings(); applySettings();
          this.binding = null;
          this.rebuild();
        });
      },
    }));
    items.push({ separator: true });
    items.push({ label: 'RESET CONTROLS', onSelect: () => {
      settings.controls.keys = null; saveSettings(); applySettings(); this.rebuild(); } });
    items.push({ label: 'BACK', onSelect: back });
    this.menu = new Menu('controls', items, { onCancel: back });
  }
  update(dt) {
    if (this.binding) {
      if (In.pressed('cancel')) { In.cancelCapture(); this.binding = null; }
      return;
    }
    this.menu.update(dt);
  }
  draw(ctx) {
    if (this.from === 'pause') { ctx.fillStyle = 'rgba(6,5,10,0.9)'; ctx.fillRect(0, 0, W, H); }
    else clear(PAL.bg);
    title(ctx, 'CONTROLS', 12);
    this.menu.draw(ctx, 40, 28, { width: W - 80, lineHeight: 12,
      hintY: H - 28, hintX: 24, hintW: W - 48 });
    if (this.binding) {
      panel(ctx, 80, 88, W - 160, 40, { fill: 'rgba(6,4,10,0.97)' });
      text(ctx, 'PRESS A KEY FOR', W / 2, 100, { align: 'centre', colour: PAL.dim });
      text(ctx, this.binding.toUpperCase(), W / 2, 112, { align: 'centre', colour: PAL.accent });
    }
    footer(ctx, [['attack', 'REBIND'], ['cancel', 'BACK']]);
  }
}

// --------------------------------------------------------------------- death
export class DeathScreen {
  constructor(flow, args) {
    this.flow = flow;
    this.t = 0;
    this.details = false;
    // Section 4: default selection is Respawn, and no accidental quit.
    this.menu = new Menu('death', [
      { label: 'RESPAWN', onSelect: () => flow.respawn() },
      { label: 'ADJUST ASSISTS', onSelect: () => flow.go('access', { from: 'death' }) },
      { label: 'RETURN TO TITLE', onSelect: () => flow.confirmQuitToTitle() },
    ], {});
    this.menu.i = 0;
  }
  update(dt) {
    this.t += dt;
    if (this.t < 0.4) return;
    if (In.pressed('map')) this.details = !this.details;
    this.menu.update(dt);
  }
  draw(ctx) {
    ctx.fillStyle = 'rgba(10,4,8,0.86)';
    ctx.fillRect(0, 0, W, H);
    text(ctx, 'THE ROAD ENDS HERE', W / 2, 52, { align: 'centre', colour: PAL.danger, shadow: '#000' });
    const cp = this.flow.save.progress.current_checkpoint_id;
    text(ctx, 'LAST WAYSTONE', W / 2, 68, { align: 'centre', colour: PAL.faint });
    text(ctx, (cp || '').split('.').pop().toUpperCase(), W / 2, 78,
         { align: 'centre', colour: PAL.dim });
    this.menu.draw(ctx, W / 2 - 55, 100, { width: 110, lineHeight: 13 });
    if (this.details) {
      const s = this.flow.save;
      text(ctx, `DEATHS ${s.stats.deaths}   FELLED ${s.stats.enemies_felled}`, W / 2, 150,
           { align: 'centre', colour: PAL.faint });
    }
    footer(ctx, [['attack', 'SELECT'], ['map', 'DETAILS']]);
  }
}

// ---------------------------------------------------------- chapter complete
export class ChapterCompleteScreen {
  constructor(flow, args) {
    this.flow = flow;
    this.ch = args.ch;
    this.stats = args.stats;
    this.t = 0;
    this.menu = new Menu('chapdone', [
      { label: 'CONTINUE', onSelect: () => flow.advanceChapter() },
    ], {});
  }
  update(dt) { this.t += dt; if (this.t > 0.35) this.menu.update(dt); }
  draw(ctx) {
    ctx.fillStyle = 'rgba(6,5,10,0.9)';
    ctx.fillRect(0, 0, W, H);
    const a = Math.min(1, this.t * 2);
    ctx.globalAlpha = a;
    text(ctx, 'CHAPTER COMPLETE', W / 2, 44, { align: 'centre', colour: PAL.accent });
    text(ctx, this.ch.name, W / 2, 58, { align: 'centre', colour: PAL.ink });
    const s = this.stats;
    text(ctx, `TIME ${formatTime(s.time)}`, W / 2, 82, { align: 'centre', colour: PAL.dim });
    text(ctx, `SECRETS ${s.secrets}/${s.secretsTotal}`, W / 2, 94, { align: 'centre', colour: PAL.dim });
    text(ctx, `ROAD ASH ${s.ash}`, W / 2, 106, { align: 'centre', colour: PAL.dim });
    if (s.unlock) text(ctx, 'UNLOCKED  ' + s.unlock, W / 2, 122, { align: 'centre', colour: PAL.good });
    this.menu.draw(ctx, W / 2 - 45, 146, { width: 90, lineHeight: 13 });
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------- vow altar
/**
 * The waystone altar: where Road Ash is actually spent.
 *
 * Section 5 calls Road Ash the common upgrade currency but never says what it
 * buys, and assigns Vow tiers to a second currency it also never spends. This
 * spends Ash on tiers, so the loop closes with one legible currency. Each tier
 * changes a stated behaviour, never a percentage.
 */
export class WaystoneScreen {
  constructor(flow, args = {}) {
    this.flow = flow;
    this.world = args.world || flow.world;
    this.msg = null;
    this.msgT = 0;
    this.rebuild();
  }
  rebuild() {
    const p = this.world.player;
    const items = [];
    for (const id of Object.keys(VOWS)) {
      const known = p.vowLevels[id] !== undefined || p.vows.includes(id);
      const lvl = p.vowLevels[id] || (known ? 1 : 0);
      const cost = lvl >= 1 ? vowUpgradeCost(lvl) : null;
      const v = VOWS[id];
      items.push({
        label: v.name.replace(/^vow of /i, '').toUpperCase(),
        value: () => !known ? 'UNFOUND'
                   : cost === null ? `TIER ${lvl} MAX`
                   : `TIER ${lvl}  ${cost} ASH`,
        locked: !known,
        disabled: false,
        hint: known ? `${v.role.toUpperCase()} -- ${v.blurb}`
                    : 'Not yet found on the road.',
        onSelect: () => {
          if (!known) { this.flash('THE ROAD HAS NOT SHOWN YOU THIS VOW'); return; }
          if (cost === null) { this.flash('ALREADY AT ITS FULL DEPTH'); return; }
          if (p.roadAsh < cost) { this.flash(`NEEDS ${cost - p.roadAsh} MORE ROAD ASH`); return; }
          p.roadAsh -= cost;
          p.vowLevels[id] = lvl + 1;
          p.writeTo(this.flow.save);
          this.flow.autosave();
          sfx('waystone');
          this.flash(`${v.name.toUpperCase()} DEEPENS TO TIER ${lvl + 1}`);
          this.rebuild();
        },
      });
    }
    items.push({ separator: true });
    items.push({ label: 'LEAVE', onSelect: () => this.flow.resume() });
    const keep = this.menu ? this.menu.i : 0;
    this.menu = new Menu('altar', items, { onCancel: () => this.flow.resume() });
    this.menu.i = Math.min(keep, items.length - 1);
    this.menu.ensureValid(1);
  }
  flash(m) { this.msg = m; this.msgT = 0; sfx(m.startsWith('NEEDS') ? 'ui_invalid' : 'ui_confirm'); }
  update(dt) {
    if (this.msg) { this.msgT += dt; if (this.msgT > 2.4) this.msg = null; }
    this.menu.update(dt);
  }
  draw(ctx) {
    ctx.fillStyle = 'rgba(6,5,10,0.86)';
    ctx.fillRect(0, 0, W, H);
    title(ctx, 'WAYSTONE', 12);
    const p = this.world.player;
    text(ctx, `ROAD ASH  ${p.roadAsh}`, W / 2, 26, { align: 'centre', colour: PAL.accent });
    panel(ctx, 26, 38, W - 52, 92);
    this.menu.draw(ctx, 38, 46, { width: W - 76, lineHeight: 12 });
    const it = this.menu.current;
    if (it && it.hint) {
      textBlock(ctx, it.hint, 26, 136, W - 52, { colour: PAL.dim });
    }
    if (this.msg) {
      const a = this.msgT > 2.0 ? Math.max(0, (2.4 - this.msgT) / 0.4) : 1;
      ctx.globalAlpha = a;
      text(ctx, this.msg, W / 2, H - 26, { align: 'centre', colour: PAL.good, shadow: '#000' });
      ctx.globalAlpha = 1;
    }
    footer(ctx, [['attack', 'DEEPEN'], ['cancel', 'LEAVE']]);
  }
}

// ------------------------------------------------------------------- credits
const CREDIT_LINES = [
  ['CROWNLESS', 'accent'],
  ['A LEGACY FANTASY SIDE-SCROLLER', 'dim'],
  ['', ''],
  ['ENVIRONMENT AND CHARACTER ART', 'accent'],
  ['ANOKOLISA', 'ink'],
  ['LEGACY FANTASY COLLECTION, 17 PACKS', 'dim'],
  ['HIGH FOREST . DUSK WOODS . LOST GLADES', 'faint'],
  ['FORGOTTEN CEMETERY . KINGDOM FORTRESS', 'faint'],
  ['CASTLE PRISON . SEWER CANALS . PURPLE BAY', 'faint'],
  ['MUDDY SWAMP . LONELY MINE . DEEP CAVE', 'faint'],
  ['DEADWIND PASS . STRANGE TEMPLE', 'faint'],
  ['SCARLET MONASTERY . BLOOD MANSION', 'faint'],
  ['WILD BOAR . BOAR WARRIOR', 'faint'],
  ['', ''],
  ['PIXEL ART MADE WITHOUT GENERATIVE AI', 'dim'],
  ['', ''],
  ['FONT, UI, VFX AND AUDIO', 'accent'],
  ['BUILT FOR THIS PROJECT', 'ink'],
  ['ALL SOUND AND MUSIC IS SYNTHESISED', 'dim'],
  ['AT RUNTIME WITH WEBAUDIO', 'dim'],
  ['', ''],
  ['ENGINE', 'accent'],
  ['NO FRAMEWORK, NO BUILD STEP', 'ink'],
  ['CANVAS 2D AT 384 X 216', 'dim'],
  ['', ''],
  ['LICENCES', 'accent'],
  ['EACH PACK SHIPS ITS OWN TERMS FILE.', 'dim'],
  ['SEE DOCS/PACK_COVERAGE.MD FOR THE LEDGER', 'dim'],
  ['AND DOCS/ASSET_ISSUES.MD FOR THE TWO', 'dim'],
  ['PACKS THAT SHIP NO LICENCE TEXT.', 'dim'],
  ['', ''],
  ['THANK YOU FOR WALKING THE ROAD.', 'accent'],
];

export class CreditsScreen {
  constructor(flow, args = {}) {
    this.flow = flow;
    this.from = args.from || 'title';
    this.y = H + 10;
    this.done = false;
  }
  update(dt) {
    this.y -= dt * (In.down('attack') ? 60 : 18);
    if (this.y < -(CREDIT_LINES.length * 12) - 20) this.exit();
    if (In.pressed('cancel') || In.pressed('pause')) this.exit();
  }
  exit() {
    if (this.done) return;
    this.done = true;
    this.flow.go('title');
  }
  draw(ctx) {
    clear(PAL.bg);
    CREDIT_LINES.forEach(([s, c], i) => {
      if (!s) return;
      const y = Math.round(this.y + i * 12);
      if (y < -12 || y > H) return;
      text(ctx, s, W / 2, y, { align: 'centre', colour: PAL[c] || PAL.ink });
    });
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, H - 14, W, 14);
    footer(ctx, [['attack', 'FASTER'], ['cancel', 'BACK']]);
  }
}

// -------------------------------------------------------------------- ending
export class EndingScreen {
  constructor(flow) { this.flow = flow; this.t = 0; }
  update(dt) {
    this.t += dt;
    if (this.t > 2 && (In.pressed('attack') || In.pressed('jump'))) this.flow.go('credits');
    if (this.t > 16) this.flow.go('credits');
  }
  draw(ctx) {
    clear('#0a0812');
    const a = Math.min(1, this.t / 1.5);
    ctx.globalAlpha = a;
    text(ctx, 'THE BELL HAS A VOICE AGAIN.', W / 2, 82, { align: 'centre', colour: PAL.ink });
    text(ctx, 'THE ROAD IS LIT THE WHOLE WAY BACK.', W / 2, 98,
         { align: 'centre', colour: PAL.accent });
    if (this.t > 2.5) {
      text(ctx, `${In.glyph('attack')} CREDITS`, W / 2, H - 26,
           { align: 'centre', colour: PAL.faint });
    }
    ctx.globalAlpha = 1;
  }
}
