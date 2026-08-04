// Environmental pressures.
//
// Section 6: "Every chapter introduces one environmental pressure -- wind,
// water, mud, darkness, moving machinery or ritual zones -- so familiar
// enemies create new decisions." The chapter data declares which pressure each
// chapter carries; this is where they actually exist.
//
// Both of these follow the same rule as an enemy attack: a readable telegraph
// first, then the consequence. A gust that arrives without warning, or a branch
// that drops the instant you walk under it, would be exactly the off-screen hit
// Section 6 forbids.

import { sfx } from '../core/audio.js';
import { vfx } from '../render/vfx.js';
import { shake, W, H } from '../core/screen.js';
import { TS, SOLID, PLATFORM } from '../render/tilemap.js';

// ----------------------------------------------------------------- wind
export class Wind {
  constructor(opts = {}) {
    this.strength = opts.strength ?? 190;   // px/s^2 at full gust
    this.period = opts.period ?? 6.2;       // seconds between gusts
    this.tellMs = opts.tellMs ?? 900;       // warning before it bites
    this.gustMs = opts.gustMs ?? 1700;
    this.t = 0;
    this.phase = 'calm';                    // calm -> tell -> gust
    this.dir = 1;
    this.force = 0;                         // current px/s^2, signed
    this.streaks = [];
    for (let i = 0; i < 40; i++) {
      this.streaks.push({ x: Math.random() * W, y: Math.random() * H,
                          v: 40 + Math.random() * 90, len: 2 + Math.random() * 5 });
    }
  }

  update(dt, world) {
    this.t += dt;
    const cycle = this.period + this.tellMs / 1000 + this.gustMs / 1000;
    const k = this.t % cycle;
    const tellAt = this.period;
    const gustAt = this.period + this.tellMs / 1000;

    let phase = 'calm';
    if (k >= gustAt) phase = 'gust';
    else if (k >= tellAt) phase = 'tell';

    if (phase !== this.phase) {
      if (phase === 'tell') {
        // pick a direction and announce it before it does anything
        this.dir = Math.random() < 0.5 ? -1 : 1;
        sfx('wind_gust');
      } else if (phase === 'gust') {
        shake(1, 140);
      }
      this.phase = phase;
    }

    // ease in and out so the gust never snaps on
    let target = 0;
    if (phase === 'tell') target = this.strength * 0.12 * this.dir;
    else if (phase === 'gust') {
      const g = (k - gustAt) / (this.gustMs / 1000);
      target = this.strength * Math.sin(Math.min(1, g) * Math.PI) * this.dir;
    }
    this.force += (target - this.force) * Math.min(1, dt * 5);

    const speed = Math.abs(this.force) / this.strength;
    for (const s of this.streaks) {
      s.x += this.force * dt * 0.06 + this.dir * s.v * dt * speed;
      if (s.x < -8) s.x = W + 8;
      if (s.x > W + 8) s.x = -8;
    }
    if (phase === 'gust' && Math.random() < 0.25) {
      vfx.emit('ash', world.camera.rx + Math.random() * W,
               world.camera.ry + Math.random() * H,
               { count: 1, dir: this.dir > 0 ? 0 : Math.PI, spread: 0.5 });
    }
  }

  /** Horizontal acceleration applied to the player, weaker with feet down. */
  forceOn(player) {
    return this.force * (player.grounded ? 0.35 : 1);
  }

  draw(ctx) {
    const a = Math.min(0.5, Math.abs(this.force) / this.strength);
    if (a < 0.03) return;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#cfe0ee';
    for (const s of this.streaks) {
      ctx.fillRect(Math.round(s.x), Math.round(s.y), Math.round(s.len), 1);
    }
    ctx.globalAlpha = 1;
  }

  /** A word on the HUD only while it matters. */
  get warning() {
    if (this.phase === 'tell') return this.dir > 0 ? 'GUST  >>' : '<<  GUST';
    return null;
  }
}

// -------------------------------------------------------------- fallers
const FALL_STATE = { ARMED: 0, TELL: 1, FALLING: 2, SPENT: 3 };

export class Faller {
  constructor(spec) {
    this.x = spec.x; this.y = spec.y;
    this.homeY = spec.y;
    this.w = 12; this.h = 10;
    this.state = FALL_STATE.ARMED;
    this.t = 0;
    this.vy = 0;
    this.triggerX = 30;      // how close before it wakes
    this.tellMs = 480;       // Section 6: the tell must be answerable
    this.resetMs = 3200;
  }

  update(dt, world) {
    const dtms = dt * 1000;
    const p = world.player;
    this.t += dtms;

    switch (this.state) {
      case FALL_STATE.ARMED: {
        if (!p.alive) return;
        if (Math.abs(p.cx - this.x) < this.triggerX && p.cy > this.y) {
          this.state = FALL_STATE.TELL;
          this.t = 0;
          sfx('breakable');
        }
        break;
      }
      case FALL_STATE.TELL: {
        // shudder and shed debris where it will land, so the threat is legible
        if (this.t % 90 < 20) {
          vfx.emit('debris', this.x, this.y + 6, { count: 1, dir: Math.PI / 2, spread: 0.6 });
        }
        if (this.t >= this.tellMs) { this.state = FALL_STATE.FALLING; this.t = 0; this.vy = 40; }
        break;
      }
      case FALL_STATE.FALLING: {
        this.vy = Math.min(340, this.vy + 900 * dt);
        this.y += this.vy * dt;
        const box = { x: this.x - this.w / 2, y: this.y, w: this.w, h: this.h };
        if (world.overlapsPlayer(box)) {
          p.hurt(1, Math.sign(p.cx - this.x) || 1, world, 'faller');
          this.burst(world);
          return;
        }
        // land on the first solid surface under it
        const cell = world.map.cellAt(this.x, this.y + this.h);
        if (cell === SOLID || cell === PLATFORM || this.y > (world.map.h + 2) * TS) {
          this.burst(world);
        }
        break;
      }
      case FALL_STATE.SPENT: {
        if (this.t >= this.resetMs) {
          this.state = FALL_STATE.ARMED;
          this.y = this.homeY;
          this.vy = 0;
          this.t = 0;
        }
        break;
      }
    }
  }

  burst(world) {
    this.state = FALL_STATE.SPENT;
    this.t = 0;
    sfx('impact_stone');
    shake(1, 90);
    vfx.emit('debris', this.x, this.y + this.h, { count: 8, dir: -Math.PI / 2, spread: 2.2 });
  }

  draw(ctx, camX, camY) {
    if (this.state === FALL_STATE.SPENT) return;
    const x = Math.round(this.x - camX), y = Math.round(this.y - camY);
    if (x < -20 || x > W + 20) return;
    const shudder = this.state === FALL_STATE.TELL
      ? Math.round(Math.sin(this.t / 22) * 1.5) : 0;
    // a small authored branch: dark limb with a lighter break face
    ctx.fillStyle = '#4a3524';
    ctx.fillRect(x - 6 + shudder, y, 12, 6);
    ctx.fillStyle = '#5d4530';
    ctx.fillRect(x - 6 + shudder, y, 12, 2);
    ctx.fillStyle = '#2f2116';
    ctx.fillRect(x - 4 + shudder, y + 6, 8, 3);
    if (this.state === FALL_STATE.TELL) {
      // the strike line, marked while it is still avoidable
      ctx.globalAlpha = 0.25 + 0.25 * Math.abs(Math.sin(this.t / 90));
      ctx.fillStyle = '#e0a050';
      ctx.fillRect(x - 6, y + 12, 12, 1);
      ctx.globalAlpha = 1;
    }
  }
}
