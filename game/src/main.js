// GameFlow: boot, title, load, gameplay, pause, death, chapter complete and
// credits (Section 11). Owns the fixed-timestep loop and the asset load.

import { W, H, ctx, canvas, clear, drawFlash, shakeOffset } from './core/screen.js';
import * as In from './core/input.js';
import { loadAll, loadJSON, Clip, img } from './core/assets.js';
import * as Audio from './core/audio.js';
import * as Settings from './core/settings.js';
import { blankSave, readSlot, writeSlot, AUTOSAVE_SLOT, formatTime } from './core/save.js';
import { text } from './core/text.js';
import { vfx } from './render/vfx.js';
import { World } from './game/world.js';
import { playerClips } from './game/player.js';
import { buildEnemyClips } from './game/enemy.js';
import { CHAPTERS, BY_ID, nextChapterId, actFor } from './game/chapters.js';
import { drawHUD } from './game/hud.js';
import { PAL } from './ui/menu.js';
import {
  BootScreen, TitleScreen, NewGameScreen, SlotScreen, PauseScreen, SettingsScreen,
  AccessScreen, ControlsScreen, DeathScreen, ChapterCompleteScreen, CreditsScreen,
  EndingScreen, WaystoneScreen,
} from './ui/screens.js';

const SCREENS = {
  boot: BootScreen, title: TitleScreen, newgame: NewGameScreen, slots: SlotScreen,
  pause: PauseScreen, settings: SettingsScreen, access: AccessScreen,
  controls: ControlsScreen, death: DeathScreen, chapdone: ChapterCompleteScreen,
  credits: CreditsScreen, ending: EndingScreen, waystone: WaystoneScreen,
};

class Flow {
  constructor(res) {
    this.res = res;
    this.screen = null;
    this.screenName = null;
    this.world = null;
    this.save = null;
    this.slot = AUTOSAVE_SLOT;
    this.paused = false;
    this.chapterStart = 0;
    this.transition = { t: 1, dir: 0, then: null };
    this.fps = 60;
    this.go('boot');
  }

  // ----------------------------------------------------------------- screens
  go(name, args = {}) {
    if (name === 'pause' && this.screenName === 'pause') return;
    const C = SCREENS[name];
    if (!C) throw new Error('no screen ' + name);
    if (name === 'pause' || name === 'waystone') args.world = this.world;
    this.screenName = name;
    this.screen = new C(this, args);
    if (name === 'title') { this.world = null; Audio.stopMusic(); Audio.setAmbience(null); }
  }

  closeScreen() { this.screen = null; this.screenName = null; }

  fade(then) {
    this.transition = { t: 0, dir: 1, then };
  }

  // ------------------------------------------------------------------- saves
  newGame(slot, difficulty) {
    Audio.start();
    this.slot = slot;
    this.save = blankSave(slot, difficulty);
    writeSlot(slot, this.save);
    this.fade(() => this.enterChapter('ch0'));
  }

  continueGame(slot) {
    Audio.start();
    const r = readSlot(slot);
    if (r.state !== 'ok' && r.state !== 'recovered') { Audio.sfx('ui_invalid'); return; }
    this.slot = slot;
    this.save = r.save;
    this.fade(() => this.enterChapter(this.save.progress.current_chapter));
  }

  autosave() {
    if (!this.save) return;
    if (this.world) this.world.player.writeTo(this.save);
    writeSlot(this.slot, this.save);
    writeSlot(AUTOSAVE_SLOT, this.save);
  }

  // ---------------------------------------------------------------- chapters
  enterChapter(id) {
    const ch = BY_ID[id] || CHAPTERS[0];
    this.save.progress.current_chapter = ch.id;
    // a chapter always starts at its own first waystone, never a stale one
    if (!String(this.save.progress.current_checkpoint_id || '').startsWith(ch.id)) {
      this.save.progress.current_checkpoint_id = ch.id + '.entry';
    }
    this.world = new World(ctx, this.res, ch, this.save);
    this.world.onDeath = () => this.go('death');
    this.world.onComplete = () => this.finishChapter();
    this.world.onCheckpoint = () => this.autosave();
    this.world.onWaystoneMenu = () => { this.paused = true; this.go('waystone'); };
    this.chapterStart = this.save.profile.play_time;
    this.startAsh = this.save.player.road_ash;
    this.closeScreen();
    this.paused = false;
    Audio.setAct(actFor(CHAPTERS.findIndex((c) => c.id === ch.id)));
    Audio.startMusic();
    this.autosave();
  }

  finishChapter() {
    const ch = this.world.ch;
    if (!this.save.progress.completed_chapters.includes(ch.id)) {
      this.save.progress.completed_chapters.push(ch.id);
    }
    this.world.player.writeTo(this.save);
    const found = (this.save.world.chapter_secret_flags[ch.id] || []).length;
    let unlock = null;
    if (ch.reward?.vow) {
      unlock = 'VOW OF ' + ch.reward.vow.toUpperCase();
      this.save.build.vow_levels[ch.reward.vow] = this.save.build.vow_levels[ch.reward.vow] || 1;
      const p = this.world.player;
      if (!p.vows.includes(ch.reward.vow)) {
        const slot = p.vows.indexOf(null);
        if (slot >= 0) p.vows[slot] = ch.reward.vow;
      }
      p.vowLevels[ch.reward.vow] = p.vowLevels[ch.reward.vow] || 1;
      p.writeTo(this.save);
    }
    if (ch.reward?.crest) {
      unlock = CHAPTERS.length && ('CREST: ' + ch.reward.crest.toUpperCase());
      if (!this.save.build.unlocked_relics.includes(ch.reward.crest)) {
        this.save.build.unlocked_relics.push(ch.reward.crest);
      }
    }
    Audio.sfx('chapter');
    Audio.setCombat(false);
    this.autosave();
    this.go('chapdone', {
      ch,
      stats: {
        time: this.save.profile.play_time - this.chapterStart,
        secrets: found, secretsTotal: this.world.c.secrets,
        ash: this.save.player.road_ash - this.startAsh,
        unlock,
      },
    });
  }

  advanceChapter() {
    const next = nextChapterId(this.world.ch.id);
    if (!next) { this.autosave(); this.go('ending'); return; }
    this.save.progress.current_checkpoint_id = next + '.entry';
    this.autosave();
    this.fade(() => this.enterChapter(next));
  }

  // -------------------------------------------------------------- gameplay
  pause() {
    if (!this.world || this.screen) return;
    this.paused = true;
    this.go('pause');
  }
  resume() {
    this.paused = false;
    this.closeScreen();
    Settings.apply();
  }
  respawn() {
    this.closeScreen();
    this.paused = false;
    this.fade(() => { this.world.respawn(); Audio.startMusic(); });
  }
  confirmQuitToTitle() {
    this.autosave();
    Audio.stopMusic();
    Audio.setCombat(false);
    this.paused = false;
    this.world = null;
    this.fade(() => this.go('title'));
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    In.poll();

    if (this.transition.dir) {
      this.transition.t += dt * 2.6;
      if (this.transition.t >= 1 && this.transition.dir === 1) {
        this.transition.dir = -1;
        this.transition.t = 1;
        const then = this.transition.then;
        this.transition.then = null;
        if (then) then();
      } else if (this.transition.dir === -1) {
        this.transition.t -= dt * 5.2;
        if (this.transition.t <= 0) { this.transition = { t: 0, dir: 0, then: null }; }
      }
    }

    if (this.screen) {
      this.screen.update(dt);
      // gameplay keeps ticking behind nothing: pause freezes it safely
      return;
    }
    if (this.world) {
      if (In.pressed('pause')) { Audio.sfx('ui_tab'); this.pause(); return; }
      if (In.pressed('map')) { Audio.sfx('ui_tab'); this.pause(); this.screen.tab = 1; this.screen.buildTab(); return; }
      this.world.fps = this.fps;
      this.world.update(dt);
    }
  }

  draw() {
    const sh = shakeOffset();
    if (this.world) {
      ctx.save();
      ctx.translate(sh.x, sh.y);
      this.world.draw(ctx);
      ctx.restore();
      drawHUD(ctx, this.world);
    } else if (!this.screen || ['boot', 'title', 'credits', 'ending'].includes(this.screenName)) {
      // screens that own the whole frame clear it themselves
    }
    if (this.screen) this.screen.draw(ctx);
    drawFlash();

    if (this.transition.dir || this.transition.t > 0) {
      ctx.globalAlpha = Math.max(0, Math.min(1, this.transition.t));
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }
}

// --------------------------------------------------------------------- boot
const bootEl = document.getElementById('boot');
const bar = document.querySelector('#bar > i');
const bootMsg = document.getElementById('bootmsg');

function progress(k, msg) {
  bar.style.width = Math.round(k * 100) + '%';
  if (msg) bootMsg.textContent = msg;
}

async function main() {
  Settings.load();
  progress(0.02, 'reading manifest');
  const [manifest, tilesets, props] = await Promise.all([
    loadJSON('data/asset_manifest.json'),
    loadJSON('data/tilesets.json'),
    loadJSON('data/props.json'),
  ]);

  // tilesets.json stores manifest-relative paths; resolve them once here so the
  // renderer and the decor pass agree on a single key.
  for (const t of Object.values(tilesets)) {
    if (!t.image.startsWith('assets/')) t.image = 'assets/' + t.image;
  }

  // every image the game can reach, loaded up front: a chapter transition must
  // not stall on a texture (Section 11 load budget)
  const paths = new Set();
  for (const c of Object.values(manifest.player.clips)) paths.add('assets/' + c.file);
  for (const m of Object.values(manifest.mobs)) {
    for (const c of Object.values(m.clips)) paths.add('assets/' + c.file);
  }
  for (const e of Object.values(manifest.environments)) {
    if (e.tiles) paths.add('assets/' + e.tiles.file);
    for (const p of e.props) paths.add('assets/' + p.file);
    for (const b of e.bg) paths.add('assets/' + b.file);
    if (e.fg) paths.add('assets/' + e.fg.file);
    for (const x of Object.values(e.extra || {})) paths.add('assets/' + x.file);
  }
  if (manifest.hud?.file) paths.add('assets/' + manifest.hud.file);

  await loadAll([...paths], (k, p) => progress(0.02 + k * 0.94, 'loading art'));
  progress(0.98, 'building clips');

  const res = {
    manifest, tilesets, props,
    clips: {
      player: playerClips(manifest, Clip),
      enemies: buildEnemyClips(manifest, Clip),
    },
  };

  const flow = new Flow(res);
  window.__crownless = flow;   // for the verification harness

  progress(1, 'ready');
  bootEl.classList.add('gone');
  setTimeout(() => bootEl.remove(), 400);

  // audio must start from a gesture
  const kick = () => { Audio.start(); Audio.applyVolumes(); };
  addEventListener('keydown', kick, { once: true });
  addEventListener('pointerdown', kick, { once: true });
  canvas.addEventListener('pointerdown', () => canvas.focus());

  // ---- fixed-timestep loop
  const STEP = 1 / 60;
  let acc = 0, last = performance.now(), fpsAcc = 0, fpsN = 0;
  function frame(now) {
    const raw = Math.min(0.25, (now - last) / 1000);
    last = now;
    acc += raw;
    fpsAcc += raw; fpsN++;
    if (fpsAcc >= 0.5) { flow.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }

    // A throw inside update or draw must not kill the loop: without this, one
    // bad frame silently freezes the whole game and every input stops arriving.
    try {
      let steps = 0;
      while (acc >= STEP && steps < 5) { flow.update(STEP); acc -= STEP; steps++; }
      if (steps === 5) acc = 0;

      clear('#07060b');
      flow.draw();
    } catch (e) {
      acc = 0;
      if (!frame.reported) {
        frame.reported = true;
        console.error('frame error:', e);
      }
      flow.lastError = e;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  bootMsg.textContent = 'failed: ' + e.message;
  bootMsg.style.color = '#d8484f';
});
