// Enemy behaviours. Five AI shapes cover the whole asset-backed roster:
// patrol, flyer, charger, melee and dropper. Each one is built around a
// visible telegraph, because Section 6 makes readability the requirement:
// no enemy may hit from off-screen and every attack has a wind-up the player
// can answer.

import { Anim, drawClip } from '../core/assets.js';
import { sfx } from '../core/audio.js';
import { vfx } from '../render/vfx.js';
import { moveBody, onGround, TS } from '../render/tilemap.js';
import { ENEMIES, VARIANTS } from './enemydata.js';
import { COMBAT } from './tuning.js';
import { settings } from '../core/settings.js';

let NEXT_ID = 1;

export class Enemy {
  constructor(kind, x, y, clips, opts = {}) {
    const variant = VARIANTS[kind];
    const baseId = variant ? variant.base : kind;
    const d = { ...ENEMIES[baseId], ...(variant ? variant.changes : {}) };
    this.id = NEXT_ID++;
    this.kind = kind;
    this.baseId = baseId;
    this.data = d;
    this.tint = variant ? variant.tint : null;
    this.clips = clips;
    this.anim = new Anim();

    this.w = d.body.w; this.h = d.body.h;
    this.x = x - this.w / 2; this.y = y - this.h;
    this.spawnX = this.x; this.spawnY = this.y;
    this.vx = 0; this.vy = 0;
    this.facing = opts.facing ?? -1;
    this.health = opts.health ?? d.health;
    this.maxHealth = this.health;
    this.state = 'idle';
    this.stateT = 0;
    this.grounded = false;
    this.flashT = 0;
    this.lastHitPass = -1;
    this.dead = false;
    this.removeAt = 0;
    this.aggro = false;
    this.cooldown = 0;
    this.patrolFrom = opts.patrolFrom ?? (this.x - 44);
    this.patrolTo = opts.patrolTo ?? (this.x + 44);
    this.laneY = y - (d.laneHeight || 0);
    this.homeY = this.y;
    this.entered = false;         // has its entrance telegraph played
    this.stagger = 0;
    this.slowT = 0;
    this.burnT = 0;
    this.burnTick = 0;
    this.isBoss = false;
    this.anchorY = opts.anchorY ?? null;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get feetY() { return this.y + this.h; }
  get box() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  setState(s) {
    if (this.state === s) return;
    this.state = s; this.stateT = 0;
  }

  clip(name) { return this.clips[name] || this.clips.idle || Object.values(this.clips)[0]; }

  // ------------------------------------------------------------------ damage
  /**
   * @returns {null|object} hit report, or null if this swing already hit us
   */
  takeHit(dmg, dirX, knockback, pass, opts = {}) {
    if (this.dead || pass === this.lastHitPass) return null;
    this.lastHitPass = pass;

    // Armoured-from-front enemies shrug off a frontal hit unless the blow is
    // heavy or a Bell Crest stagger. This is the one place armour matters, and
    // it is always signalled by the spark family and sound.
    const frontal = (dirX !== 0) && (Math.sign(dirX) === -Math.sign(this.facing) || Math.sign(dirX) === this.facing * -1);
    const facingHit = Math.sign(this.cx - (opts.sourceX ?? this.cx - dirX)) === Math.sign(this.facing);
    let armoured = false;
    if (this.data.armouredFrom === 'front' && !opts.heavy && this.state !== 'stagger') {
      const attackerInFront = opts.sourceX !== undefined
        ? Math.sign(opts.sourceX - this.cx) === Math.sign(this.facing)
        : true;
      if (attackerInFront && (this.state === 'shell' || this.data.poise)) armoured = true;
    }
    if (opts.effect === 'stagger') armoured = false;

    const dealt = armoured ? Math.max(0, Math.round(dmg * 0.25)) : Math.round(dmg);
    this.health -= dealt;
    this.flashT = COMBAT.enemyFlashMs;

    if (!armoured) {
      this.vx += dirX * knockback * (this.data.elite ? 0.45 : 1);
      if (this.grounded && knockback > 120) this.vy = -70;
    } else {
      this.vx += dirX * knockback * 0.15;
    }

    if (opts.effect === 'burn') { this.burnT = 2200; this.burnTick = 0; }
    if (opts.effect === 'slow') this.slowT = 2400;

    const killed = this.health <= 0;
    if (killed) this.kill();
    else if (!armoured && this.clips.hit) { this.setState('hit'); this.anim.play(this.clips.hit, true); }

    return {
      killed, armoured,
      px: this.cx + (dirX ? Math.sign(dirX) * -this.w / 2 : 0),
      py: this.cy - 2,
      enemy: this,
    };
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.health = 0;
    this.setState('dead');
    const c = this.clips.dead || this.clips.hit;
    if (c) this.anim.play(c, true);
    this.removeAt = performance.now() + (c ? c.total + 260 : 400);
    sfx(this.data.elite ? 'elite_cue' : 'enemy_death');
    vfx.emit('spark', this.cx, this.cy, { count: 8 });
  }

  // ------------------------------------------------------------------ update
  update(dt, world) {
    const dtms = dt * 1000;
    this.stateT += dtms;
    if (this.flashT > 0) this.flashT -= dtms;
    if (this.cooldown > 0) this.cooldown -= dtms;
    if (this.slowT > 0) this.slowT -= dtms;
    if (this.burnT > 0) {
      this.burnT -= dtms;
      this.burnTick -= dtms;
      if (this.burnTick <= 0) {
        this.burnTick = 480;
        this.health -= 1;
        vfx.emit('spark', this.cx, this.cy, { count: 3, colour: '#ff9a3c' });
        if (this.health <= 0) this.kill();
      }
    }

    if (this.dead) {
      this.vx *= Math.pow(0.02, dt);
      this.physics(dt, world, true);
      this.anim.update(dtms);
      return;
    }

    const p = world.player;
    const slowK = this.slowT > 0 ? 0.55 : 1;
    if (this.isBoss) this.updateBossPhase(world);

    switch (this.data.ai) {
      case 'patrol':  this.aiPatrol(dt, world, p, slowK); break;
      case 'flyer':   this.aiFlyer(dt, world, p, slowK); break;
      case 'charger': this.aiCharger(dt, world, p, slowK); break;
      case 'melee':   this.aiMelee(dt, world, p, slowK); break;
      case 'dropper': this.aiDropper(dt, world, p, slowK); break;
      default:        this.aiPatrol(dt, world, p, slowK);
    }

    if (this.data.ai !== 'flyer') this.physics(dt, world, false);
    else this.physicsFly(dt, world);

    this.anim.update(dtms);
    this.touchPlayer(world, p);
  }

  /**
   * Bosses shift phase on health thresholds: shorter tells, faster movement and
   * a longer attack pattern. Section 6 asks for "three short phases" on the
   * final fight rather than one long health bar, and the tell shortening is
   * what actually communicates the escalation to the player.
   */
  updateBossPhase(world) {
    const def = this.bossDef;
    if (!def || !def.phases) return;
    const frac = this.health / this.maxHealth;
    let idx = 0;
    for (let i = 0; i < def.phases.length; i++) if (frac <= def.phases[i].at) idx = i;
    if (idx === this.phaseIndex) return;
    this.phaseIndex = idx;
    const ph = def.phases[idx];
    this.data = { ...this.data, tell: ph.tell, cooldown: ph.cooldown, speed: ph.speed };
    this.pattern = ph.pattern;
    this.patternStep = 0;
    if (idx > 0) {
      // a clear, readable beat between phases rather than a silent stat swap
      this.setState('stagger');
      sfx('tell_boss');
      vfx.emit('spark', this.cx, this.cy, { count: 12, colour: '#ff9a3c' });
      vfx.ring(this.cx, this.cy, '#ff9a3c', 30, 420);
      if (world.setBanner) world.setBanner(`${def.name} -- PHASE ${idx + 1}`, 1.8);
    }
  }

  physics(dt, world, dying) {
    this.grounded = onGround(world.map, this);
    this.vy = Math.min(300, this.vy + 780 * dt);
    const r = moveBody(world.map, this, this.vx * dt, this.vy * dt);
    if (r.hitX) { this.vx = 0; this.turnAtEdge = true; }
    if (r.grounded) this.vy = 0;
    if (!dying) this.vx *= Math.pow(0.0009, dt);
  }

  physicsFly(dt, world) {
    const r = moveBody(world.map, this, this.vx * dt, this.vy * dt);
    if (r.hitX) this.vx *= -1;
    if (r.hitY) this.vy *= -0.4;
  }

  /** Would a step forward walk us off a ledge or into a wall? */
  edgeAhead(world) {
    const ax = this.cx + this.facing * (this.w / 2 + 3);
    const belowSolid = world.map.cellAt(ax, this.feetY + 3);
    const wall = world.map.solidAt(ax, this.cy);
    return wall || !(belowSolid === 1 || belowSolid === 2);
  }

  sees(p, range) {
    if (!p || !p.alive) return false;
    const dx = p.cx - this.cx;
    if (Math.abs(dx) > range) return false;
    if (Math.abs(p.cy - this.cy) > 46) return false;
    return true;
  }

  faceToward(p) { this.facing = p.cx < this.cx ? -1 : 1; }

  // ---------------------------------------------------------------- patrol
  aiPatrol(dt, world, p, k) {
    const d = this.data;
    if (this.state === 'hit' && this.anim.done) this.setState('walk');

    // The snail shells up when the player closes, which is the armour lesson.
    if (d.shellMs && this.sees(p, 40)) {
      if (this.state !== 'shell') {
        this.setState('shell');
        if (this.clips.hide) this.anim.play(this.clips.hide, true);
      }
    } else if (this.state === 'shell' && this.stateT > d.shellMs * 0.5) {
      this.setState('walk');
    }

    if (this.state === 'shell') { this.vx = 0; return; }

    this.setState('walk');
    this.anim.play(this.clip('walk'));
    if (this.edgeAhead(world) || this.cx < this.patrolFrom || this.cx > this.patrolTo) {
      this.facing *= -1;
      // step off the boundary so we cannot oscillate on it
      this.x += this.facing * 1.5;
    }
    this.vx = this.facing * d.speed * k;
  }

  // ----------------------------------------------------------------- flyer
  aiFlyer(dt, world, p, k) {
    const d = this.data;
    if (this.state === 'hit') { if (this.anim.done) this.setState('fly'); this.vx *= 0.9; this.vy *= 0.9; return; }

    if (this.state === 'dive') {
      this.anim.play(this.clip('attack'));
      if (this.stateT > 620) { this.setState('return'); this.cooldown = d.cooldown; }
      return;
    }
    if (this.state === 'tell') {
      // hover and pulse before committing, so the lane is legible
      this.vx *= 0.86; this.vy *= 0.86;
      if (this.stateT % 120 < 20) {
        vfx.emit('spark', this.cx, this.cy + 6, { count: 1, colour: '#ffd97a' });
      }
      if (this.stateT >= d.tell) {
        const dx = p.cx - this.cx, dy = p.cy - this.cy;
        const len = Math.hypot(dx, dy) || 1;
        this.vx = (dx / len) * d.diveSpeed;
        this.vy = (dy / len) * d.diveSpeed;
        this.setState('dive');
        sfx('tell_swing');
      }
      return;
    }

    this.anim.play(this.clip('fly'));
    // bob along the lane above its anchor
    const targetY = this.laneY + Math.sin(performance.now() / 520 + this.id) * 7;
    this.vy += (targetY - this.cy) * 2.4 * dt * 60 * dt;
    this.vy = Math.max(-60, Math.min(60, this.vy + (targetY - this.cy) * 0.06));
    if (this.state === 'return') {
      const dx = this.spawnX + this.w / 2 - this.cx;
      this.vx += Math.sign(dx) * 40 * dt * 6;
      this.vx = Math.max(-50, Math.min(50, this.vx));
      if (Math.abs(dx) < 8) this.setState('fly');
    } else {
      this.vx *= 0.92;
      if (p) this.faceToward(p);
      if (this.cooldown <= 0 && this.sees(p, 96) && Math.abs(p.cy - this.cy) < 70) {
        this.setState('tell');
      }
    }
  }

  // --------------------------------------------------------------- charger
  aiCharger(dt, world, p, k) {
    const d = this.data;
    if (this.state === 'hit') { if (this.anim.done) this.setState('idle'); return; }

    if (this.state === 'tell') {
      this.vx *= 0.8;
      this.anim.play(this.clip('idle'));
      // two-stage tell for the elite: paw, pause, then go
      const stage2 = d.tellStages === 2 && this.stateT > d.tell * 0.55;
      if (this.stateT % 140 < 24) {
        vfx.emit('dust', this.cx + this.facing * 8, this.feetY - 1,
                 { count: stage2 ? 3 : 1, dir: this.facing > 0 ? 0 : Math.PI, spread: 0.8 });
      }
      if (this.stateT >= d.tell) {
        this.setState('charge');
        sfx('tell_charge');
      }
      return;
    }
    if (this.state === 'charge') {
      this.anim.play(this.clip('run'));
      this.vx = this.facing * d.chargeSpeed * k;
      if (this.edgeAhead(world) || this.stateT > 1500) {
        this.setState('recover');
        vfx.emit('dust', this.cx, this.feetY - 1, { count: 5, dir: Math.PI, spread: 2 });
      }
      return;
    }
    if (this.state === 'recover') {
      // the vulnerable window Section 6 asks for
      this.vx *= Math.pow(0.004, dt);
      this.anim.play(this.clip('idle'));
      if (this.stateT >= d.recoverMs) this.setState('idle');
      return;
    }

    // idle / walk
    this.anim.play(this.clip('walk'));
    if (this.edgeAhead(world) || this.cx < this.patrolFrom || this.cx > this.patrolTo) {
      this.facing *= -1; this.x += this.facing * 1.5;
    }
    this.vx = this.facing * d.speed * k;
    if (this.sees(p, d.sightRange)) {
      this.faceToward(p);
      this.setState('tell');
    }
  }

  // ----------------------------------------------------------------- melee
  aiMelee(dt, world, p, k) {
    const d = this.data;
    if (this.state === 'hit') { if (this.anim.done) this.setState('idle'); this.vx *= 0.9; return; }
    if (this.state === 'stagger') {
      this.vx *= Math.pow(0.01, dt);
      if (this.stateT > 520) this.setState('idle');
      return;
    }

    if (this.state === 'tell') {
      this.vx *= Math.pow(0.02, dt);
      this.anim.play(this.clip('idle'));
      if (this.stateT > d.tell * 0.5 && this.stateT % 130 < 22) {
        vfx.emit('spark', this.cx + this.facing * 8, this.cy - 6,
                 { count: 1, colour: settings.accessibility.telegraphBoost ? '#ffffff' : '#ffd97a' });
      }
      if (this.stateT >= d.tell) {
        this.setState('swing');
        this.anim.play(this.clip('attack'), true);
        sfx('tell_swing');
        this.swungAt = -1;
      }
      return;
    }
    if (this.state === 'swing') {
      this.vx *= Math.pow(0.05, dt);
      this.anim.play(this.clip('attack'));
      // the active window is the middle third of the attack clip
      const c = this.clip('attack');
      const f = this.anim.frame;
      const from = Math.floor(c.frames * 0.35), to = Math.ceil(c.frames * 0.62);
      if (f >= from && f <= to && this.swungAt !== this.stateT) {
        const box = {
          x: this.facing > 0 ? this.x + this.w - 2 : this.x + 2 - d.attackRange,
          y: this.cy - 12, w: d.attackRange, h: 22,
        };
        if (world.overlapsPlayer(box)) {
          if (p.hurt(d.contactDamage, this.facing, world, 'enemy')) this.swungAt = this.stateT;
        }
      }
      if (this.anim.done) { this.setState('recover'); }
      return;
    }
    if (this.state === 'recover') {
      this.vx *= Math.pow(0.02, dt);
      this.anim.play(this.clip('idle'));
      if (this.stateT >= d.recoverMs) { this.setState('idle'); this.cooldown = d.cooldown; }
      return;
    }

    // approach or patrol
    if (this.sees(p, d.sightRange)) {
      this.aggro = true;
      this.faceToward(p);
      const dist = Math.abs(p.cx - this.cx);
      if (dist <= d.attackRange * 0.8 && this.cooldown <= 0) {
        this.setState('tell');
        this.vx = 0;
        return;
      }
      if (dist > d.attackRange * 0.7) {
        this.anim.play(this.clip(this.clips.run ? 'run' : 'walk'));
        this.vx = this.facing * d.speed * k * 1.15;
        if (this.edgeAhead(world)) this.vx = 0;
      } else {
        this.vx *= 0.8;
        this.anim.play(this.clip('idle'));
      }
      return;
    }
    this.aggro = false;
    this.anim.play(this.clip('walk'));
    if (this.edgeAhead(world) || this.cx < this.patrolFrom || this.cx > this.patrolTo) {
      this.facing *= -1; this.x += this.facing * 1.5;
    }
    this.vx = this.facing * d.speed * k * 0.7;
  }

  // --------------------------------------------------------------- dropper
  aiDropper(dt, world, p, k) {
    const d = this.data;
    if (this.state === 'hit') { if (this.anim.done) this.setState('idle'); return; }

    if (this.state === 'falling') {
      this.anim.play(this.clip('fall'));
      if (this.grounded) {
        this.setState('move');
        sfx('impact_flesh');
        vfx.emit('splash', this.cx, this.feetY - 2, { count: 5, dir: -Math.PI / 2, spread: 2 });
      }
      return;
    }
    if (this.state === 'move') {
      this.anim.play(this.clip('move'));
      if (this.edgeAhead(world)) { this.facing *= -1; this.x += this.facing * 1.5; }
      this.vx = this.facing * d.speed * k;
      if (p) { /* keeps crawling; contact damage does the work */ }
      return;
    }

    // hanging, waiting to drop
    this.anim.play(this.clip('idle'));
    this.vy = 0;
    this.y = this.homeY;
    if (p && Math.abs(p.cx - this.cx) < d.dropRange && p.cy > this.cy) {
      if (this.stateT > d.tell) {
        this.setState('falling');
        vfx.emit('mud', this.cx, this.feetY, { count: 3, dir: Math.PI / 2, spread: 1 });
      } else if (this.stateT % 110 < 20) {
        vfx.emit('splash', this.cx, this.feetY, { count: 1, colour: '#8fd8a0' });
      }
    } else {
      this.stateT = 0;
    }
  }

  // ------------------------------------------------------------- contact
  touchPlayer(world, p) {
    if (this.dead || !p || !p.alive) return;
    if (this.state === 'tell' || this.state === 'recover') {
      // wind-up and recovery are not damaging: the tell must be answerable
      if (this.data.ai !== 'charger') return;
    }
    if (!world.overlapsPlayer(this.box)) return;
    const dir = Math.sign(p.cx - this.cx) || this.facing;
    p.hurt(this.data.contactDamage, dir, world, 'contact');
  }

  // ---------------------------------------------------------------- draw
  draw(ctx, camX, camY, debug) {
    const c = this.anim.clip || this.clip('idle');
    if (!c) return;
    const ax = Math.round(c.fw / 2);
    // Enemy sheets keep the creature standing on the cell floor, so anchoring
    // to the cell bottom puts its feet on our collision box's feet.
    const ay = this.anchorY ?? c.fh;
    const px = this.cx - camX;
    const py = this.feetY - camY;

    if (this.flashT > 0) {
      // hit flash: draw the sprite, then a white silhouette over it
      drawClip(ctx, c, this.anim.frame, px, py, ax, ay, this.facing > 0);
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.restore();
    }
    drawClip(ctx, c, this.anim.frame, px, py, ax, ay, this.facing > 0,
             this.dead ? Math.max(0, Math.min(1, (this.removeAt - performance.now()) / 300)) : 1);

    if (this.flashT > 0) {
      ctx.globalAlpha = Math.min(0.85, this.flashT / COMBAT.enemyFlashMs);
      ctx.globalCompositeOperation = 'lighter';
      drawClip(ctx, c, this.anim.frame, px, py, ax, ay, this.facing > 0, 0.9);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // telegraph boost: an accessibility option, not a default
    if (settings.accessibility.telegraphBoost && this.state === 'tell') {
      const k = (Math.sin(performance.now() / 60) + 1) / 2;
      ctx.globalAlpha = 0.25 + k * 0.4;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeRect(Math.round(this.x - camX) - 1.5, Math.round(this.y - camY) - 1.5,
                     this.w + 3, this.h + 3);
      ctx.globalAlpha = 1;
    }

    if (debug) {
      ctx.strokeStyle = this.aggro ? '#ffcc33' : '#ff5599';
      ctx.strokeRect(Math.round(this.x - camX) + 0.5, Math.round(this.y - camY) + 0.5,
                     this.w - 1, this.h - 1);
    }
  }
}

/** Build clip tables for every mob in the manifest. */
export function buildEnemyClips(manifest, Clip) {
  const out = {};
  for (const [mid, m] of Object.entries(manifest.mobs)) {
    const clips = {};
    for (const [name, c] of Object.entries(m.clips)) {
      clips[name] = new Clip('assets/' + c.file, c.frames, c.fw, c.fh, c.fps, c.loop);
    }
    out[mid] = clips;
  }
  return out;
}

/** Resolve a spawn kind (base or variant) to its clip table. */
export function clipsFor(kind, table) {
  const v = VARIANTS[kind];
  return table[v ? v.base : kind];
}
