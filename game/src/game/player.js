// The player, as an explicit state machine (Section 5).
//
// Each state owns its input handling, velocity rules, animation, cancel window
// and exits. Nothing here is a pile of animation checks, and no state plays an
// animation the collection does not contain: Attack 2 is a timing and feedback
// variant of the single authored attack clip, and jump/aerial attacks, dodges,
// crouch, ladders and blocks are deliberately absent because their art is.

import { Anim, drawClip } from '../core/assets.js';
import * as In from '../core/input.js';
import { sfx } from '../core/audio.js';
import { shake } from '../core/screen.js';
import { vfx } from '../render/vfx.js';
import { moveBody, onGround, groundBelow, TS, HAZARD, WATER } from '../render/tilemap.js';
import { MOVE, COMBAT, PLAYER_ANCHOR, VOWS, CRESTS } from './tuning.js';
import { settings } from '../core/settings.js';

export const S = {
  IDLE: 'GroundedIdle', RUN: 'GroundedRun', JUMP_START: 'JumpStart',
  AIR: 'Airborne', LAND: 'Land', ATTACK1: 'Attack1', ATTACK2: 'Attack2',
  HURT: 'HitReaction', HEAL: 'Heal', INTERACT: 'Interact',
  DEAD: 'Dead', DISABLED: 'Disabled',
};

// v0 = 2h/t, g = 2h/t^2
const JUMP_V = (2 * MOVE.jumpHeight) / MOVE.jumpApex;
const GRAVITY = (2 * MOVE.jumpHeight) / (MOVE.jumpApex * MOVE.jumpApex);

export class Player {
  constructor(clips, save) {
    this.clips = clips;
    this.anim = new Anim();
    this.anim.onEvent = (e) => this.onAnimEvent(e);

    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.w = MOVE.bodyW; this.h = MOVE.bodyH;
    this.facing = 1;
    this.state = S.IDLE;
    this.stateT = 0;
    this.grounded = false;
    this.groundY = 0;

    this.lastGroundedAt = -1e9;
    this.jumpHeld = false;
    this.landLock = 0;
    this.fallSpeed = 0;

    // combat
    this.hitActive = false;
    this.hitPass = 0;              // increments per swing so one swing hits once
    this.hurtGrace = 0;            // ms of invulnerability remaining
    this.knockVx = 0;
    this.attackKind = 1;
    this.queuedAttack = false;

    // progression mirror of the save
    this.maxHealth = save.player.max_health;
    this.health = save.player.current_health;
    this.healCharges = save.player.healing_count;
    this.healPartial = 0;
    this.roadAsh = save.player.road_ash;
    this.vows = save.build.equipped_vows.slice();
    this.vowLevels = { ...save.build.vow_levels };
    this.crest = save.build.sword_crest;

    this.ashStacks = 0;            // Vow of Ash
    this.stoneReady = true;        // Vow of Stone, armed at each waystone
    this.airborneFrom = 0;

    this.alive = true;
    this.surface = 'grass';
    this.inWater = false;
    this.footT = 0;
  }

  // ------------------------------------------------------------- vow helpers
  vowTier(id) {
    if (!this.vows.includes(id)) return null;
    const lvl = Math.max(1, Math.min(3, this.vowLevels[id] || 1));
    return VOWS[id].tiers[lvl - 1];
  }

  get box() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get feetY() { return this.y + this.h; }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
    const c = this.clips;
    switch (s) {
      case S.IDLE: this.anim.play(c.idle); break;
      case S.RUN: this.anim.play(c.run); break;
      case S.JUMP_START: this.anim.play(c.jump_start, true); break;
      case S.AIR: this.anim.play(c.jump_rise); break;
      case S.LAND: this.anim.play(c.jump_end, true); break;
      case S.ATTACK1: this.anim.play(c.attack1, true); break;
      case S.ATTACK2: this.anim.play(c.attack2, true); break;
      case S.HURT: this.anim.play(c.hurt, true); break;
      case S.HEAL: this.anim.play(c.idle); break;
      case S.INTERACT: this.anim.play(c.idle); break;
      case S.DEAD: this.anim.play(c.dead, true); break;
      case S.DISABLED: this.anim.play(c.idle); break;
    }
  }

  onAnimEvent(e) {
    if (e === 'hit_on') { this.hitActive = true; this.hitPass++; }
    else if (e === 'hit_off') this.hitActive = false;
    else if (e === 'step') this.footstep();
  }

  footstep() {
    const map = { grass: 'step_grass', stone: 'step_stone', water: 'step_water', mud: 'step_mud' };
    sfx(map[this.surface] || 'step_stone');
    vfx.emit('dust', this.cx - this.facing * 3, this.feetY - 1, { count: 2, dir: Math.PI, spread: 1.2 });
  }

  // ------------------------------------------------------------------ update
  update(dt, world) {
    const dtms = dt * 1000;
    this.stateT += dtms;
    if (this.hurtGrace > 0) this.hurtGrace -= dtms;

    const wasGrounded = this.grounded;
    this.grounded = onGround(world.map, this);
    if (this.grounded) this.lastGroundedAt = performance.now();

    // surface + water, for footstep sound and movement feel
    const cell = world.map.cellAt(this.cx, this.feetY + 2);
    this.inWater = world.map.cellAt(this.cx, this.cy) === WATER;
    this.surface = world.surfaceKind || 'grass';
    if (this.inWater) this.surface = 'water';

    if (this.state !== S.DEAD && this.state !== S.DISABLED) {
      const hz = world.map.cellAt(this.cx, this.feetY - 1);
      if (hz === HAZARD || cell === HAZARD) {
        this.hurt(1, this.facing * -1, world, 'hazard');
      }
    }

    switch (this.state) {
      case S.IDLE: case S.RUN: this.stGround(dt, world); break;
      case S.JUMP_START: this.stJumpStart(dt, world); break;
      case S.AIR: this.stAir(dt, world); break;
      case S.LAND: this.stLand(dt, world); break;
      case S.ATTACK1: case S.ATTACK2: this.stAttack(dt, world); break;
      case S.HURT: this.stHurt(dt, world); break;
      case S.HEAL: this.stHeal(dt, world); break;
      case S.INTERACT: this.stInteract(dt, world); break;
      case S.DEAD: this.stDead(dt, world); break;
      case S.DISABLED: this.vx = 0; break;
    }

    // knockback decays independently of input so a hit always reads
    if (Math.abs(this.knockVx) > 1) {
      this.knockVx -= this.knockVx * Math.min(1, COMBAT.knockbackDecay * dt);
    } else this.knockVx = 0;

    this.integrate(dt, world);
    this.anim.update(dtms);

    if (!wasGrounded && this.grounded) this.onLand(world);
    if (wasGrounded && !this.grounded) this.airborneFrom = performance.now();

    this.groundY = groundBelow(world.map, this);

    // fell out of the world
    if (this.y > (world.map.h + 4) * TS && this.alive) {
      this.hurt(99, 0, world, 'pit');
    }
  }

  integrate(dt, world) {
    const grav = GRAVITY * (this.vy > 0 ? MOVE.fallGravityMul : 1)
                 * (this.inWater ? 0.55 : 1);
    if (this.state !== S.DEAD || !this.grounded) {
      this.vy = Math.min(MOVE.maxFall * (this.inWater ? 0.5 : 1), this.vy + grav * dt);
    }
    const vx = (this.vx + this.knockVx) * (this.inWater ? 0.7 : 1);
    const dropThrough = In.down('down') && In.down('jump');
    const r = moveBody(world.map, this, vx * dt, this.vy * dt, { dropThrough });
    if (r.hitX) { this.vx = 0; this.knockVx *= 0.2; }
    if (r.grounded) { this.fallSpeed = this.vy; this.vy = 0; }
    if (r.ceiling) this.vy = Math.max(0, this.vy);
  }

  // ------------------------------------------------------------------ states
  wantsJump() {
    return In.sincePressed('jump') <= MOVE.bufferMs;
  }
  canCoyote() {
    return performance.now() - this.lastGroundedAt <= MOVE.coyoteMs;
  }

  tryStartAttack() {
    if (!In.pressed('attack')) return false;
    // Attack 2 is the committed finisher: held attack, or a follow-up chained
    // during Attack 1's cancel window.
    this.beginAttack(1);
    return true;
  }

  beginAttack(kind) {
    this.attackKind = kind;
    this.hitActive = false;
    this.setState(kind === 2 ? S.ATTACK2 : S.ATTACK1);
    sfx(kind === 2 ? 'attack2' : 'attack1');
    if (kind === 2) {
      const c = CRESTS[this.crest] || CRESTS.plain;
      vfx.emit('spark', this.cx + this.facing * 14, this.cy - 4,
               { count: 5, dir: this.facing > 0 ? -0.4 : Math.PI + 0.4, colour: c.colour });
    }
  }

  stGround(dt, world) {
    if (this.landLock > 0) { this.landLock -= dt * 1000; this.vx *= 0.7; return; }
    const ax = In.axisX();
    const target = ax * (settings.gameplay.holdToRun && !In.down('interact')
                         ? MOVE.runSpeed : MOVE.runSpeed);
    if (ax !== 0) {
      this.facing = ax;
      const reversing = Math.sign(this.vx) !== 0 && Math.sign(this.vx) !== ax;
      const accel = MOVE.groundAccel * (reversing ? MOVE.turnBoost : 1);
      this.vx += Math.sign(target - this.vx) * accel * dt;
      if (Math.abs(this.vx - target) < 6) this.vx = target;
      this.setState(S.RUN);
      // skid dust when the turn actually bites
      if (reversing && Math.abs(this.vx) > 30 && Math.random() < 0.25) {
        vfx.emit('skid', this.cx, this.feetY - 1, { count: 2, dir: ax > 0 ? Math.PI : 0, spread: 0.8 });
      }
    } else {
      const f = MOVE.groundFriction * dt;
      this.vx = Math.abs(this.vx) <= f ? 0 : this.vx - Math.sign(this.vx) * f;
      this.setState(S.IDLE);
    }

    // run footsteps are driven by distance, so the cycle and the speed agree
    if (Math.abs(this.vx) > 10) {
      this.footT += Math.abs(this.vx) * dt;
      if (this.footT > 19) { this.footT = 0; this.footstep(); }
    } else this.footT = 14;

    if (this.wantsJump() && (this.grounded || this.canCoyote())) {
      In.consume('jump');
      this.setState(S.JUMP_START);
      return;
    }
    if (!this.grounded && !this.canCoyote()) { this.setState(S.AIR); return; }
    if (this.tryStartAttack()) return;
    if (In.pressed('heal') && this.healCharges > 0 && this.health < this.maxHealth) {
      this.setState(S.HEAL); return;
    }
    if (In.pressed('interact') && world.tryInteract && world.tryInteract(this)) {
      this.setState(S.INTERACT);
    }
  }

  stJumpStart(dt, world) {
    // The jump-start clip is 4 frames of crouch; the launch happens on frame 2
    // so the anticipation reads without costing responsiveness.
    this.vx += In.axisX() * MOVE.groundAccel * MOVE.airControl * dt;
    this.vx = Math.max(-MOVE.runSpeed, Math.min(MOVE.runSpeed, this.vx));
    if (this.stateT >= 55) {
      this.vy = -JUMP_V;
      this.jumpHeld = true;
      this.grounded = false;
      sfx('jump');
      vfx.emit('puff', this.cx, this.feetY - 1, { count: 4, dir: Math.PI / 2, spread: 2.2 });
      this.setState(S.AIR);
    }
  }

  stAir(dt, world) {
    const ax = In.axisX();
    if (ax !== 0) this.facing = ax;
    const reed = this.vowTier('reed');
    const control = MOVE.airControl + (reed ? reed.airBonus : 0);
    if (ax !== 0) {
      this.vx += ax * MOVE.groundAccel * control * dt;
      this.vx = Math.max(-MOVE.runSpeed, Math.min(MOVE.runSpeed, this.vx));
    } else {
      const f = MOVE.airFriction * dt;
      this.vx = Math.abs(this.vx) <= f ? 0 : this.vx - Math.sign(this.vx) * f;
    }
    // variable jump height: releasing early cuts the rise
    if (this.jumpHeld && !In.down('jump') && this.vy < 0) {
      this.vy *= MOVE.cutJumpMul;
      this.jumpHeld = false;
    }
    // Airborne pose follows physics state rather than a looping clip: rise
    // while climbing, apex around the turn, fall once committed downward.
    const c = this.clips;
    const want = this.vy < -40 ? c.jump_rise : this.vy < 60 ? c.jump_apex : c.jump_fall;
    this.anim.play(want);

    if (this.grounded && this.vy >= 0) { this.setState(S.LAND); return; }
    if (this.tryStartAttack()) return;
  }

  onLand(world) {
    const heavy = this.fallSpeed >= MOVE.heavyFallSpeed;
    this.landLock = heavy ? MOVE.landHeavyMs : MOVE.landLockMs;
    sfx(heavy ? 'land_heavy' : 'land_light');
    vfx.emit(heavy ? 'land_heavy' : 'land', this.cx, this.feetY - 1,
             { dir: Math.PI, spread: Math.PI * 1.4 });
    if (heavy) shake(1, 70);
    if (this.inWater) { sfx('splash'); vfx.emit('splash', this.cx, this.feetY - 2, { dir: -Math.PI / 2, spread: 1.8 }); }

    // Vow of Reed: a "perfect landing" is one taken within a short window of
    // first leaving the ground -- rewarding tight, deliberate hops.
    const reed = this.vowTier('reed');
    if (reed) {
      const airMs = performance.now() - this.airborneFrom;
      if (airMs > 120 && this.fallSpeed > 60 && this.fallSpeed < MOVE.heavyFallSpeed) {
        this.healPartial += reed.refill;
        vfx.emit('vow', this.cx, this.feetY - 6, { count: 4 });
        while (this.healPartial >= 1) { this.healPartial -= 1; this.healCharges++; }
      }
    }
    this.fallSpeed = 0;
  }

  stLand(dt, world) {
    this.vx *= Math.pow(0.001, dt);
    if (this.tryStartAttack()) return;
    if (this.wantsJump()) { In.consume('jump'); this.setState(S.JUMP_START); return; }
    if (this.anim.done || this.stateT > 130) this.setState(In.axisX() ? S.RUN : S.IDLE);
  }

  stAttack(dt, world) {
    const cfg = this.attackKind === 2 ? COMBAT.attack2 : COMBAT.attack1;
    // committed: very little steering mid-swing, and none on the finisher
    const drag = this.attackKind === 2 ? 0.0005 : 0.02;
    this.vx *= Math.pow(drag, dt);
    if (!this.grounded) {
      const ax = In.axisX();
      this.vx += ax * MOVE.groundAccel * MOVE.airControl * 0.5 * dt;
    }

    // buffer the follow-up during the tail of the swing (Section 5)
    if (In.pressed('attack') && this.anim.frame >= cfg.cancelFrom - 1) {
      this.queuedAttack = true;
    }

    if (this.hitActive) this.resolveHit(world, cfg);

    if (this.anim.done) {
      this.hitActive = false;
      if (this.queuedAttack && this.attackKind === 1) {
        this.queuedAttack = false;
        this.beginAttack(2);
        return;
      }
      this.queuedAttack = false;
      this.setState(this.grounded ? (In.axisX() ? S.RUN : S.IDLE) : S.AIR);
      return;
    }
    // early cancel out of recovery into movement
    if (this.anim.frame >= cfg.cancelFrom && this.attackKind === 1) {
      if (In.axisX() !== 0 && this.grounded) { this.setState(S.RUN); this.hitActive = false; }
      else if (this.wantsJump() && this.grounded) {
        In.consume('jump'); this.hitActive = false; this.setState(S.JUMP_START);
      }
    }
  }

  /** The hurtbox for the current swing, in world space. */
  attackBox(cfg) {
    const w = cfg.reach, h = cfg.height;
    return {
      x: this.facing > 0 ? this.x + this.w - 2 : this.x + 2 - w,
      y: this.cy + cfg.yOffset,
      w, h,
    };
  }

  resolveHit(world, cfg) {
    const box = this.attackBox(cfg);
    const ash = this.vowTier('ash');
    const dmgMul = 1 + (ash ? Math.min(this.ashStacks, ash.stacks) * ash.dmgPer : 0);
    const stopMul = 1 + (ash ? Math.min(this.ashStacks, ash.stacks) * ash.stopPer : 0);
    const crest = CRESTS[this.crest] || CRESTS.plain;

    const hits = world.damageEnemies(box, {
      damage: cfg.damage * dmgMul,
      knockback: cfg.knockback,
      dirX: this.facing,
      pass: this.hitPass,
      heavy: this.attackKind === 2,
      effect: this.attackKind === 2 ? crest.effect : null,
      source: this,
    });

    if (hits.length) {
      const heavy = cfg.hitStop === 'heavy';
      let stop = (heavy ? COMBAT.hitStopHeavy : COMBAT.hitStopLight) * stopMul;
      const killed = hits.some((h) => h.killed);
      if (killed) stop *= COMBAT.hitStopFinalMul;
      world.hitStop(stop * settings.accessibility.hitStop);
      shake(heavy ? COMBAT.shakeHeavy : COMBAT.shakeLight,
            heavy ? COMBAT.shakeHeavyMs : COMBAT.shakeLightMs);
      // Section 5: the spark appears at the resolved contact point, not the
      // centre of either sprite.
      for (const h of hits) {
        const fam = h.armoured ? 'spark_armour' : heavy ? 'spark_heavy' : 'spark';
        vfx.emit(fam, h.px, h.py, { dir: this.facing > 0 ? -0.5 : Math.PI + 0.5, spread: 1.6 });
        sfx(h.armoured ? 'impact_armour' : 'impact_flesh');
        if (h.killed) sfx('final_hit');
      }
      if (ash) this.ashStacks = Math.min(ash.stacks, this.ashStacks + 1);
    }
  }

  stHurt(dt, world) {
    this.vx *= Math.pow(0.02, dt);
    if (this.stateT > 260 || (this.anim.done && this.stateT > 160)) {
      this.setState(this.grounded ? S.IDLE : S.AIR);
    }
  }

  stHeal(dt, world) {
    this.vx *= Math.pow(0.0005, dt);
    const tide = this.vowTier('tide');
    const dur = COMBAT.healMs * (tide ? tide.healMul : 1);
    if (this.stateT === 0 || this.stateT < 30) {
      if (this.stateT < 20) { sfx('heal'); vfx.emit('heal', this.cx, this.cy, { count: 10 }); }
    }
    if (this.stateT >= dur) {
      this.healCharges--;
      this.health = Math.min(this.maxHealth, this.health + COMBAT.healAmount);
      vfx.emit('heal', this.cx, this.cy - 4, { count: 12 });
      vfx.ring(this.cx, this.cy, '#8fffb0', 18, 260);
      if (tide) {
        world.damageEnemies(
          { x: this.cx - tide.pulseRadius, y: this.cy - tide.pulseRadius,
            w: tide.pulseRadius * 2, h: tide.pulseRadius * 2 },
          { damage: tide.pulseDamage, knockback: 60, dirX: 0, pass: ++this.hitPass, source: this });
        vfx.ring(this.cx, this.cy, '#5fe08c', tide.pulseRadius, 320);
      }
      this.setState(S.IDLE);
    }
    // healing is punishable: taking a hit cancels it and wastes nothing
  }

  stInteract(dt, world) {
    this.vx *= Math.pow(0.001, dt);
    if (this.stateT > 240) this.setState(S.IDLE);
  }

  stDead(dt, world) {
    this.vx *= Math.pow(0.02, dt);
  }

  // ------------------------------------------------------------------ damage
  canBeHurt() {
    return this.alive && this.hurtGrace <= 0
           && this.state !== S.DEAD && this.state !== S.DISABLED;
  }

  hurt(amount, dirX, world, kind = 'enemy') {
    if (!this.canBeHurt()) return false;
    const diff = world.difficulty || { damageTaken: 1, grace: 0 };
    const assists = settings.assists;
    const dmg = Math.max(1, Math.round(amount * diff.damageTaken * assists.damageTaken));

    const stone = this.vowTier('stone');
    let kb = COMBAT.attack1.knockback * 0.9;
    let grace = COMBAT.graceMs + diff.grace + assists.extraGrace;
    if (stone && this.stoneReady) {
      kb *= stone.kbMul;
      grace += stone.graceAdd;
      this.stoneReady = false;
      vfx.emit('vow', this.cx, this.cy, { count: 8, colour: '#cbb6ff' });
    }

    this.health -= dmg;
    this.ashStacks = 0;                 // taking damage clears the Ash chain
    this.hurtGrace = Math.max(120, grace);
    this.knockVx = (dirX || -this.facing) * kb;
    this.vy = Math.min(this.vy, -110);

    sfx('hurt');
    world.hitStop(COMBAT.hitStopHeavy * settings.accessibility.hitStop);
    shake(2, 110);
    vfx.emit('spark', this.cx, this.cy, { count: 6, colour: '#ff9a8a' });

    if (this.health <= 0) { this.die(world); return true; }
    this.setState(S.HURT);
    return true;
  }

  die(world) {
    this.health = 0;
    this.alive = false;
    this.setState(S.DEAD);
    sfx('death');
    shake(3, 200);
    if (world.onPlayerDeath) world.onPlayerDeath();
  }

  /** Called when a waystone is restored: re-arms Vow of Stone. */
  onWaystone() {
    this.stoneReady = true;
    this.ashStacks = 0;
  }

  // ------------------------------------------------------------------- draw
  draw(ctx, camX, camY, debug) {
    const A = PLAYER_ANCHOR;
    // Grace blinking uses a different rhythm to the enemy hit flash so the two
    // never read as the same event (Section 5).
    let alpha = 1;
    if (this.hurtGrace > 0 && this.alive) {
      const phase = Math.floor(this.hurtGrace / (COMBAT.graceBlinkMs / 2)) % 2;
      alpha = phase ? 0.35 : 1;
    }
    const px = this.x + this.w / 2 - camX;
    const py = this.y + this.h - camY;
    if (this.anim.clip) {
      drawClip(ctx, this.anim.clip, this.anim.frame, px, py, A.x, A.y, this.facing < 0, alpha);
    }
    if (debug) {
      ctx.strokeStyle = '#39ff88';
      ctx.strokeRect(Math.round(this.x - camX) + 0.5, Math.round(this.y - camY) + 0.5, this.w - 1, this.h - 1);
      if (this.hitActive) {
        const cfg = this.attackKind === 2 ? COMBAT.attack2 : COMBAT.attack1;
        const b = this.attackBox(cfg);
        ctx.strokeStyle = '#ff3355';
        ctx.strokeRect(Math.round(b.x - camX) + 0.5, Math.round(b.y - camY) + 0.5, b.w - 1, b.h - 1);
      }
    }
  }

  /** Write live values back into the save structure. */
  writeTo(save) {
    save.player.max_health = this.maxHealth;
    save.player.current_health = this.health;
    save.player.healing_count = this.healCharges;
    save.player.road_ash = this.roadAsh;
    save.build.equipped_vows = this.vows.slice();
    save.build.vow_levels = { ...this.vowLevels };
    save.build.sword_crest = this.crest;
  }
}

/** Build the player's clip table from the loaded manifest. */
export function playerClips(manifest, Clip) {
  const m = manifest.player.clips;
  const mk = (id, opts = {}) => new Clip(
    'assets/' + m[id].file,
    opts.frames ?? m[id].frames,
    m[id].fw, m[id].fh,
    opts.fps ?? m[id].fps,
    opts.loop ?? m[id].loop,
    opts);
  const atk = COMBAT.attack1, atk2 = COMBAT.attack2;
  const evOf = (cfg) => {
    const ev = {};
    ev[cfg.activeFrom] = 'hit_on';
    ev[cfg.activeTo + 1] = 'hit_off';
    return ev;
  };
  return {
    idle: mk('idle'),
    // footstep events on the contact frames of the 8-frame run cycle
    run: mk('run', { events: { 1: 'step', 5: 'step' } }),
    attack1: mk('attack1', { durations: atk.durations, events: evOf(atk) }),
    attack2: mk('attack1', { durations: atk2.durations, events: evOf(atk2) }),
    jump_start: mk('jump_start'),
    // The 15-frame Jump-All sheet is one continuous take: 0-3 crouch and
    // launch, 4-6 rise, 7-9 hang, 10-12 fall, 13-14 land. Split into three
    // physics-selected clips instead of looping the whole thing.
    jump_rise: mk('jump_all', { offset: 4, frames: 3, fps: 14, loop: false }),
    jump_apex: mk('jump_all', { offset: 7, frames: 3, fps: 10, loop: true }),
    jump_fall: mk('jump_all', { offset: 10, frames: 3, fps: 12, loop: false }),
    jump_end: mk('jump_end'),
    dead: mk('dead'),
    hurt: mk('hurt'),
  };
}
