// The playable world: one chapter, its entities, and the rules that connect
// them. Owns hit-stop, damage arbitration, pickups, checkpoints, arenas and the
// contextual tutorial prompts.

import { img, Clip } from '../core/assets.js';
import * as In from '../core/input.js';
import { sfx, setAmbience, setCombat, waystoneResolve } from '../core/audio.js';
import { shake, W, H } from '../core/screen.js';
import { text, textWidth } from '../core/text.js';
import { vfx } from '../render/vfx.js';
import { Camera } from '../render/camera.js';
import { Parallax, Foreground } from '../render/parallax.js';
import { TS, SOLID, PLATFORM, HAZARD, WATER } from '../render/tilemap.js';
import { Player, S, playerClips } from './player.js';
import { Enemy, clipsFor } from './enemy.js';
import { BOSSES, ENEMIES, VARIANTS } from './enemydata.js';
import { composeChapter } from './compose.js';
import { WAYSTONE_LINES, actFor, BY_ID } from './chapters.js';
import { DIFFICULTIES, COMBAT } from './tuning.js';
import { settings } from '../core/settings.js';

export class World {
  constructor(ctx, res, ch, save) {
    this.ctx = ctx;
    this.res = res;                      // {manifest, tilesets, props, clips}
    this.ch = ch;
    this.save = save;
    this.difficulty = DIFFICULTIES[save.profile.difficulty] || DIFFICULTIES.wayfarer;

    const c = composeChapter(ch, res.tilesets, res.props);
    this.c = c;
    this.map = c.map;
    this.surfaceKind = ch.surface || 'grass';

    this.player = new Player(res.clips.player, save);
    this.enemies = [];
    this.pickups = [];
    this.waystones = [];
    this.secretsList = [];
    this.arena = null;
    this.boss = null;
    this.bossBar = 0;

    this.hitStopMs = 0;
    this.camera = new Camera();
    this.time = 0;
    this.prompt = null;
    this.promptT = 0;
    this.chapterCue = { text: ch.name, t: 0 };
    this.banner = null;
    this.complete = false;
    this.debug = false;

    this.buildParallax();
    this.spawnEntities();
    this.resetToSpawn(save.progress.current_checkpoint_id);

    setAmbience(ch.ambience);
  }

  // ------------------------------------------------------------------ setup
  buildParallax() {
    const env = this.res.manifest.environments[this.ch.biome];
    const layers = env.bg.map((b) => 'assets/' + b.file);
    const speeds = [0.04, 0.12, 0.24, 0.5].slice(-Math.max(1, layers.length));
    this.parallax = new Parallax(layers, {
      speeds,
      sky: this.ch.sky, skyBottom: this.ch.skyBottom,
      haze: this.ch.haze, hazeColour: this.ch.skyBottom || this.ch.sky,
      yAnchor: this.c.horizonY + 40,
      drift: layers.map((_, i) => (this.ch.hazard === 'wind' ? (i + 1) * 1.6 : 0)),
    });
    this.foreground = env.fg ? new Foreground('assets/' + env.fg.file, {
      yAnchor: this.c.horizonY + 96, alpha: 0.85, speed: 1.14,
    }) : null;
  }

  spawnEntities() {
    for (const e of this.c.entities) {
      switch (e.type) {
        case 'enemy': this.addEnemy(e); break;
        case 'boss': this.addBoss(e); break;
        case 'waystone':
          this.waystones.push({ ...e, lit: this.save.world.restored_waystones.includes(e.id) });
          break;
        case 'ash':
          this.pickups.push({ kind: 'ash', x: e.x, y: e.y, amount: e.amount, t: 0, taken: false });
          break;
        case 'fragment':
          if (!this.save.world.collected_fragment_ids.includes(e.id)) {
            this.pickups.push({ kind: 'fragment', id: e.id, x: e.x, y: e.y, t: 0, taken: false });
          }
          break;
        case 'secret':
          this.secretsList.push({ ...e, found: (this.save.world.chapter_secret_flags[this.ch.id] || []).includes(e.id) });
          break;
        case 'arena':
          this.arenaDef = e;
          break;
      }
    }
  }

  addEnemy(e) {
    const clips = clipsFor(e.kind, this.res.clips.enemies);
    if (!clips) return;
    const en = new Enemy(e.kind, e.x, e.y, clips, {
      facing: e.facing, patrolFrom: e.patrolFrom, patrolTo: e.patrolTo,
    });
    this.enemies.push(en);
    return en;
  }

  addBoss(e) {
    const def = BOSSES[e.boss];
    if (!def) return;
    const clips = clipsFor(def.base, this.res.clips.enemies);
    if (!clips) return;
    const en = new Enemy(def.base, e.x, e.y, clips, { facing: -1,
      patrolFrom: e.x0 + 24, patrolTo: e.x1 - 24, health: def.health });
    en.isBoss = true;
    en.bossDef = def;
    en.data = { ...en.data, contactDamage: def.contactDamage, health: def.health };
    en.maxHealth = def.health;
    en.health = def.health;
    en.dormant = true;
    this.enemies.push(en);
    this.bossEntity = en;
    this.bossZone = { x0: e.x0, x1: e.x1 };
  }

  // ------------------------------------------------------------- checkpoints
  resetToSpawn(checkpointId) {
    const cp = this.c.checkpoints.find((k) => k.id === checkpointId);
    const p = cp ? { x: cp.x, y: cp.y } : this.c.spawn;
    this.player.x = p.x - this.player.w / 2;
    this.player.y = p.y - this.player.h;
    this.player.vx = 0; this.player.vy = 0;
    this.player.alive = true;
    this.player.setState(S.IDLE);
    this.player.hurtGrace = 600;
    this.camera.snapTo(this.player.cx, this.player.cy);
    if (cp && settings.assists.checkpointHeal) {
      this.player.health = this.player.maxHealth;
    }
    this.player.onWaystone();
  }

  /** Full respawn after death: restore enemies too. */
  respawn() {
    this.enemies.length = 0;
    this.pickups.length = 0;
    this.spawnEntities();
    this.player.health = this.player.maxHealth;
    this.player.healCharges = Math.max(1, this.player.healCharges);
    this.resetToSpawn(this.save.progress.current_checkpoint_id);
    this.arena = null;
    setCombat(false);
  }

  // ------------------------------------------------------------------ update
  hitStop(ms) { this.hitStopMs = Math.max(this.hitStopMs, ms); }

  overlapsPlayer(box) {
    const p = this.player;
    return box.x < p.x + p.w && box.x + box.w > p.x
        && box.y < p.y + p.h && box.y + box.h > p.y;
  }

  /** Apply a swing to every enemy it overlaps. Returns the hit reports. */
  damageEnemies(box, opts) {
    const hits = [];
    for (const e of this.enemies) {
      if (e.dead || e.dormant) continue;
      if (!(box.x < e.x + e.w && box.x + box.w > e.x
            && box.y < e.y + e.h && box.y + box.h > e.y)) continue;
      const r = e.takeHit(opts.damage, opts.dirX, opts.knockback, opts.pass, {
        heavy: opts.heavy, effect: opts.effect,
        sourceX: opts.source ? opts.source.cx : undefined,
      });
      if (r) {
        hits.push(r);
        if (r.killed) {
          this.save.stats.enemies_felled++;
          this.player.roadAsh += Math.round(e.data.ash * (1 + (this.player.vowTier('road')?.bonus || 0)));
        }
      }
    }
    return hits;
  }

  update(dt) {
    // hit-stop freezes gameplay but never the UI (Section 5)
    if (this.hitStopMs > 0) {
      this.hitStopMs -= dt * 1000;
      dt = 0;
    }
    this.time += dt;
    this.save.profile.play_time += dt * 1000;

    const p = this.player;
    if (dt > 0) {
      p.update(dt, this);
      for (const e of this.enemies) {
        if (e.dormant) { this.checkBossWake(e); continue; }
        e.update(dt, this);
      }
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (e.dead && performance.now() > e.removeAt) this.enemies.splice(i, 1);
      }
      this.updatePickups(dt);
      this.updateWaystones(dt);
      this.updateArena(dt);
      this.updateSecrets(dt);
      vfx.update(dt);
      this.parallax.update(dt);
    }

    this.updateCameraBounds();
    this.camera.update(Math.max(dt, 0.0001), {
      x: p.cx, y: p.cy, vx: p.vx, facing: p.facing,
      grounded: p.grounded, groundY: p.groundY,
    });

    if (this.chapterCue.t < 3.4) this.chapterCue.t += dt;
    if (this.prompt) this.promptT += dt;
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }

    this.updatePrompts();
    this.checkExit();
  }

  updateCameraBounds() {
    const cx = this.player.cx;
    const room = this.c.rooms.find((r) => cx >= r.x0 * TS && cx < r.x1 * TS);
    const wpx = this.c.width * TS, hpx = this.map.h * TS;
    if (this.arena) {
      this.camera.lock({ x0: this.arena.x0, y0: 0, x1: this.arena.x1, y1: hpx });
      return;
    }
    this.camera.unlock();
    // Bounds are authored per room and blended across connections, so the frame
    // never snaps at a join.
    const b = room
      ? { x0: Math.max(0, room.x0 * TS - 40), y0: 0,
          x1: Math.min(wpx, room.x1 * TS + 40), y1: hpx }
      : { x0: 0, y0: 0, x1: wpx, y1: hpx };
    if (this._boundRoom !== (room ? room.index : -1)) {
      this._boundRoom = room ? room.index : -1;
      this.camera.setBounds(b, 260);
    } else {
      this.camera.setBounds(b, 0);
    }
  }

  updatePickups(dt) {
    const p = this.player;
    const magnet = p.vowTier('road')?.magnet || 0;
    for (const k of this.pickups) {
      if (k.taken) continue;
      k.t += dt;
      const dx = p.cx - k.x, dy = p.cy - k.y;
      const d = Math.hypot(dx, dy);
      if (magnet && d < magnet && k.kind === 'ash') {
        k.x += (dx / d) * 120 * dt;
        k.y += (dy / d) * 120 * dt;
      }
      if (d < 12) {
        k.taken = true;
        if (k.kind === 'ash') {
          p.roadAsh += k.amount;
          sfx('pickup');
          vfx.emit('pickup', k.x, k.y, { count: 6 });
        } else if (k.kind === 'fragment') {
          this.save.world.collected_fragment_ids.push(k.id);
          const have = this.save.world.collected_fragment_ids.length;
          sfx('secret');
          vfx.ring(k.x, k.y, '#ffd97a', 22, 420);
          if (have % 4 === 0) {
            p.maxHealth++; p.health = p.maxHealth;
            this.setBanner('HEALTH RESTORED AND DEEPENED', 2.6);
          } else {
            this.setBanner(`HEALTH FRAGMENT  ${have % 4}/4`, 2.2);
          }
        }
      }
    }
    this.pickups = this.pickups.filter((k) => !k.taken);
  }

  updateWaystones(dt) {
    const p = this.player;
    for (const w of this.waystones) {
      const d = Math.abs(p.cx - w.x) + Math.abs(p.feetY - w.y);
      if (d < 20 && !w.lit) {
        w.lit = true;
        this.save.progress.current_checkpoint_id = w.id;
        if (!this.save.world.restored_waystones.includes(w.id)) {
          this.save.world.restored_waystones.push(w.id);
        }
        p.onWaystone();
        if (settings.assists.checkpointHeal) p.health = p.maxHealth;
        sfx('waystone');
        sfx('save');
        waystoneResolve();
        vfx.ring(w.x, w.y - 10, this.ch.accent, 30, 520);
        vfx.emit('vow', w.x, w.y - 12, { count: 14, colour: this.ch.accent });
        const line = WAYSTONE_LINES[w.key];
        if (line) this.setBanner(line, 4.2);
        if (this.onCheckpoint) this.onCheckpoint();
        // the prison chapter hands the sword back at its first waystone
        if (w.restore && this.stripped) this.restoreKit();
      } else if (d < 20 && w.lit) {
        this.save.progress.current_checkpoint_id = w.id;
      }
    }
  }

  updateSecrets(dt) {
    const p = this.player;
    const bells = p.vowTier('bells');
    for (const s of this.secretsList) {
      if (s.found) continue;
      const d = Math.hypot(p.cx - s.x, p.cy - s.y);
      if (bells && d < bells.radius && Math.random() < 0.02) {
        // a soft pulse, not a marker: the clue stays diegetic
        vfx.emit('secret', s.x, s.y, { count: 2 });
        this.secretPulse = 0.6;
      }
      if (d < 26) {
        s.found = true;
        this.save.stats.secrets_found++;
        const flags = this.save.world.chapter_secret_flags[this.ch.id] || [];
        if (!flags.includes(s.id)) flags.push(s.id);
        this.save.world.chapter_secret_flags[this.ch.id] = flags;
        sfx('secret');
        vfx.ring(s.x, s.y, '#c8b4ff', 26, 500);
      }
    }
    if (this.secretPulse > 0) this.secretPulse -= dt;
  }

  updateArena(dt) {
    if (!this.arenaDef) return;
    const p = this.player;
    if (!this.arena && p.cx > this.arenaDef.x0 + 24 && p.cx < this.arenaDef.x1) {
      const alive = this.enemies.filter((e) => !e.dead
        && e.cx >= this.arenaDef.x0 && e.cx <= this.arenaDef.x1);
      if (alive.length) {
        this.arena = { x0: this.arenaDef.x0, x1: this.arenaDef.x1, name: this.arenaDef.name };
        setCombat(true);
        sfx('elite_cue');
        this.setBanner(this.arenaDef.name, 2.4);
      }
    }
    if (this.arena) {
      const alive = this.enemies.filter((e) => !e.dead
        && e.cx >= this.arena.x0 && e.cx <= this.arena.x1);
      if (!alive.length) {
        this.arena = null;
        this.arenaDef = null;
        setCombat(false);
        this.setBanner('THE WAY IS OPEN', 2.0);
      }
    }
  }

  checkBossWake(e) {
    if (!e.dormant) return;
    const p = this.player;
    if (p.cx > this.bossZone.x0 + 40) {
      e.dormant = false;
      this.boss = e;
      this.arena = { x0: this.bossZone.x0, x1: this.bossZone.x1, name: e.bossDef.name };
      this.arenaDef = null;
      setCombat(true);
      sfx('tell_boss');
      this.setBanner(e.bossDef.name, 3.0);
    }
  }

  restoreKit() {
    this.stripped = false;
    this.player.vows = this.savedVows || this.player.vows;
    this.setBanner('YOUR SWORD, AND YOUR VOWS', 3.2);
    sfx('waystone');
  }

  setBanner(t, dur) { this.banner = { text: t, t: 0, dur: dur || 2.5 }; }

  // ------------------------------------------------------------ interactions
  tryInteract(p) {
    for (const w of this.waystones) {
      if (Math.abs(p.cx - w.x) < 22 && Math.abs(p.feetY - w.y) < 24) return true;
    }
    return false;
  }

  checkExit() {
    if (this.complete) return;
    const p = this.player;
    if (p.cx > this.c.exit.x && p.alive) {
      // boss chapters must have the boss down before the exit opens
      if (this.bossEntity && !this.bossEntity.dead) return;
      this.complete = true;
      if (this.onComplete) this.onComplete();
    }
  }

  onPlayerDeath() {
    this.save.stats.deaths++;
    setCombat(false);
    if (this.onDeath) setTimeout(() => this.onDeath(), 900);
  }

  // -------------------------------------------------------------- prompts
  /**
   * Contextual tutorial prompts. Section 4: one at a time, near the relevant
   * world object, using the current device's glyph, dismissed when the action
   * is demonstrated rather than on a timer, and never shown again once done.
   */
  updatePrompts() {
    if (!this.ch.tutorial || !settings.gameplay.tutorialPrompts) { this.prompt = null; return; }
    const p = this.player;
    const done = this.save.world.tutorial_steps;
    const step = (id) => done.includes(id);
    const finish = (id) => { if (!step(id)) done.push(id); this.prompt = null; };

    // move
    if (!step('move')) {
      if (Math.abs(p.vx) > 20) return finish('move');
      return this.setPrompt('move', 'MOVE', ['left', 'right'], p.cx, p.y - 16);
    }
    // jump: shown at the first gap the player faces
    if (!step('jump')) {
      if (p.state === S.AIR || p.state === S.JUMP_START) return finish('jump');
      const gapAhead = this.gapAhead(p);
      if (gapAhead) return this.setPrompt('jump', 'JUMP', ['jump'], p.cx, p.y - 16);
      this.prompt = null; return;
    }
    // attack: only when facing something worth hitting
    if (!step('attack')) {
      if (p.state === S.ATTACK1 || p.state === S.ATTACK2) return finish('attack');
      const target = this.enemies.find((e) => !e.dead && Math.abs(e.cx - p.cx) < 46
                                              && Math.abs(e.cy - p.cy) < 24);
      if (target) return this.setPrompt('attack', 'STRIKE', ['attack'], target.cx, target.y - 14);
      this.prompt = null; return;
    }
    // heal, offered the first time the player is actually hurt
    if (!step('heal')) {
      if (p.state === S.HEAL) return finish('heal');
      if (p.health < p.maxHealth && p.healCharges > 0) {
        return this.setPrompt('heal', 'MEND', ['heal'], p.cx, p.y - 16);
      }
      this.prompt = null; return;
    }
    // waystone
    if (!step('waystone')) {
      const w = this.waystones.find((k) => Math.abs(p.cx - k.x) < 40 && !k.lit);
      if (w) return this.setPrompt('waystone', 'WAYSTONE', [], w.x, w.y - 30);
      if (this.waystones.some((k) => k.lit)) return finish('waystone');
      this.prompt = null; return;
    }
    this.prompt = null;
  }

  gapAhead(p) {
    const dir = p.facing;
    for (let d = 1; d <= 4; d++) {
      const tx = Math.floor((p.cx + dir * d * TS) / TS);
      const ty = Math.floor((p.feetY + 2) / TS);
      if (this.map.get(tx, ty) === 0 && this.map.get(tx, ty + 1) === 0) return true;
    }
    return false;
  }

  setPrompt(id, label, actions, x, y) {
    this.prompt = { id, label, actions, x, y };
  }

  // ------------------------------------------------------------------- draw
  draw(ctx) {
    const camX = this.camera.rx, camY = this.camera.ry;

    this.parallax.draw(ctx, camX, camY);
    this.map.drawLayer(ctx, 'ground', camX, camY);
    this.drawDecor(ctx, camX, camY, 'mid');

    this.drawWaystones(ctx, camX, camY);
    this.drawPickups(ctx, camX, camY);

    for (const e of this.enemies) {
      if (e.dormant) continue;
      e.draw(ctx, camX, camY, this.debug);
    }
    this.player.draw(ctx, camX, camY, this.debug);
    vfx.draw(ctx, camX, camY);

    this.drawDecor(ctx, camX, camY, 'fore');
    if (this.foreground) this.foreground.draw(ctx, camX, camY);
    if (this.ch.dark) this.drawDarkness(ctx, camX, camY);
    if (this.ch.weather === 'rain') this.drawRain(ctx);

    if (this.debug) this.map.drawCollision(ctx, camX, camY);
    this.drawPrompt(ctx, camX, camY);
  }

  drawDecor(ctx, camX, camY, layer) {
    for (const d of this.c.decor) {
      if (d.layer !== layer) continue;
      const dx = d.x - camX, dy = d.y - camY;
      if (dx + d.sw < -8 || dx > W + 8) continue;
      ctx.drawImage(img('assets/' + d.sheet.replace(/^assets\//, '')),
                    d.sx, d.sy, d.sw, d.sh, Math.round(dx), Math.round(dy), d.sw, d.sh);
    }
  }

  drawWaystones(ctx, camX, camY) {
    for (const w of this.waystones) {
      const x = Math.round(w.x - camX), y = Math.round(w.y - camY);
      if (x < -24 || x > W + 24) continue;
      // a small authored marker: a standing stone with the ember in it
      ctx.fillStyle = '#2a2430';
      ctx.fillRect(x - 4, y - 22, 8, 22);
      ctx.fillStyle = '#3b3444';
      ctx.fillRect(x - 5, y - 24, 10, 4);
      const pulse = (Math.sin(this.time * 3) + 1) / 2;
      if (w.lit) {
        ctx.fillStyle = this.ch.accent;
        ctx.fillRect(x - 2, y - 19, 4, 5);
        ctx.globalAlpha = 0.28 + pulse * 0.28;
        ctx.fillRect(x - 4, y - 21, 8, 9);
        ctx.globalAlpha = 1;
        if (Math.random() < 0.06) vfx.emit('vow', w.x, w.y - 20, { count: 1, colour: this.ch.accent });
      } else {
        ctx.fillStyle = '#4a4356';
        ctx.fillRect(x - 2, y - 19, 4, 5);
      }
    }
  }

  drawPickups(ctx, camX, camY) {
    for (const k of this.pickups) {
      const x = Math.round(k.x - camX);
      const y = Math.round(k.y - camY + Math.sin(k.t * 3) * 2);
      if (x < -12 || x > W + 12) continue;
      if (k.kind === 'ash') {
        ctx.fillStyle = '#c8a24a';
        ctx.fillRect(x - 1, y - 1, 3, 3);
        ctx.fillStyle = '#ffe9a8';
        ctx.fillRect(x, y, 1, 1);
      } else {
        const pulse = (Math.sin(k.t * 4) + 1) / 2;
        ctx.fillStyle = '#e05a6a';
        ctx.fillRect(x - 3, y - 3, 6, 6);
        ctx.fillStyle = '#ff9aa8';
        ctx.fillRect(x - 1, y - 3, 2, 6);
        ctx.fillRect(x - 3, y - 1, 6, 2);
        ctx.globalAlpha = 0.3 + pulse * 0.3;
        ctx.fillRect(x - 4, y - 4, 8, 8);
        ctx.globalAlpha = 1;
      }
    }
  }

  drawDarkness(ctx, camX, camY) {
    // A masked pool of light rather than a full-screen fog: Section 8 forbids
    // anything that drops enemy silhouettes below the contrast target.
    const p = this.player;
    const px = Math.round(p.cx - camX), py = Math.round(p.cy - camY);
    const g = ctx.createRadialGradient(px, py, 26, px, py, 118);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(4,4,10,${this.ch.dark})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  drawRain(ctx) {
    ctx.fillStyle = 'rgba(180,200,225,0.30)';
    const t = this.time * 900;
    for (let i = 0; i < 46; i++) {
      const x = ((i * 97 + t * 0.6) % (W + 30)) - 15;
      const y = ((i * 53 + t) % (H + 20)) - 10;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 3);
    }
  }

  drawPrompt(ctx, camX, camY) {
    if (!this.prompt) return;
    const pr = this.prompt;
    const glyphs = pr.actions.map((a) => In.glyph(a)).join('/');
    const label = glyphs ? `${glyphs}  ${pr.label}` : pr.label;
    const wpx = textWidth(label);
    let x = Math.round(pr.x - camX);
    let y = Math.round(pr.y - camY);
    x = Math.max(6 + wpx / 2, Math.min(W - 6 - wpx / 2, x));
    y = Math.max(14, Math.min(H - 30, y));
    const a = Math.min(1, this.promptT * 4);
    ctx.globalAlpha = a * 0.72;
    ctx.fillStyle = '#0b0910';
    ctx.fillRect(x - wpx / 2 - 3, y - 2, wpx + 6, 11);
    ctx.globalAlpha = a;
    text(ctx, label, x, y, { align: 'centre', colour: '#f0e6d2', shadow: '#000000' });
    ctx.globalAlpha = 1;
  }
}
