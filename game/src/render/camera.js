// Camera. Section 8: pixel-snap the rendered camera while keeping subpixel
// physics internally; small horizontal dead zone with directional look-ahead;
// vertical tracking waits for a real change of platform band; bounds authored
// per room and blended across connections.

import { W, H } from '../core/screen.js';

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;            // subpixel truth
    this.bounds = { x0: 0, y0: 0, x1: 1e6, y1: 1e6 };
    this.lookAhead = 0;                // current smoothed look-ahead
    this.deadZone = 12;                // px of horizontal slack
    this.bandY = 0;                    // last committed platform band
    this.locked = null;                // {x0,y0,x1,y1} while a boss arena holds
    this.blend = 1;                    // 0..1 while easing into new bounds
    this.pendingBounds = null;
  }

  setBounds(b, blendMs = 0) {
    if (blendMs <= 0) { this.bounds = { ...b }; this.pendingBounds = null; this.blend = 1; return; }
    this.pendingBounds = { from: { ...this.bounds }, to: { ...b }, t: 0, dur: blendMs };
  }

  lock(b) { this.locked = { ...b }; }
  unlock() { this.locked = null; }

  /** Snap straight to the target, for spawns and teleports. */
  snapTo(tx, ty) {
    this.x = tx - W / 2;
    this.y = ty - H / 2;
    this.bandY = ty;
    this.lookAhead = 0;
    this.clamp();
  }

  clamp() {
    const b = this.locked || this.bounds;
    const maxX = Math.max(b.x0, b.x1 - W);
    const maxY = Math.max(b.y0, b.y1 - H);
    this.x = Math.min(Math.max(this.x, b.x0), maxX);
    this.y = Math.min(Math.max(this.y, b.y0), maxY);
  }

  /**
   * @param target  {x, y, vx, facing, grounded, groundY}
   */
  update(dt, target) {
    if (this.pendingBounds) {
      const p = this.pendingBounds;
      p.t += dt * 1000;
      const k = Math.min(1, p.t / p.dur);
      const e = k * k * (3 - 2 * k);
      this.bounds = {
        x0: p.from.x0 + (p.to.x0 - p.from.x0) * e,
        y0: p.from.y0 + (p.to.y0 - p.from.y0) * e,
        x1: p.from.x1 + (p.to.x1 - p.from.x1) * e,
        y1: p.from.y1 + (p.to.y1 - p.from.y1) * e,
      };
      if (k >= 1) this.pendingBounds = null;
    }

    // ---- horizontal: dead zone + look-ahead, never a hard centre lock
    const centre = this.x + W / 2;
    const dx = target.x - centre;
    let move = 0;
    if (dx > this.deadZone) move = dx - this.deadZone;
    else if (dx < -this.deadZone) move = dx + this.deadZone;

    // Look-ahead only commits when the player is actually travelling, so
    // turning on the spot does not swing the frame around.
    const speedK = Math.min(1, Math.abs(target.vx) / 60);
    const wantAhead = target.facing * 34 * speedK;   // ~2 tiles at full speed
    this.lookAhead += (wantAhead - this.lookAhead) * Math.min(1, dt * 3.2);

    const goalX = this.x + move + (this.lookAhead - this.lookAhead * 0) * 0;
    this.x = goalX;
    // ease the look-ahead in as an offset rather than a target jump
    const desired = target.x - W / 2 + this.lookAhead;
    this.x += (desired - this.x) * Math.min(1, dt * 2.4);

    // ---- vertical: hold until the platform band really changes
    const bandChanged = Math.abs(target.groundY - this.bandY) > 26;
    if (target.grounded && bandChanged) this.bandY = target.groundY;
    // follow the player up quickly if they leave the top of frame
    const topPad = 54, botPad = 70;
    const relY = target.y - this.y;
    // Sit the standing surface about two thirds down the frame: it keeps the
    // sky and the biome's landmarks in view and stops the subsurface fill
    // taking half the screen.
    let goalY = this.bandY - H * 0.68;
    if (relY < topPad) goalY = Math.min(goalY, target.y - topPad);
    if (relY > H - botPad) goalY = Math.max(goalY, target.y - (H - botPad));
    this.y += (goalY - this.y) * Math.min(1, dt * (target.grounded ? 3.0 : 5.5));

    this.clamp();
  }

  /** Integer render offset. Physics keeps the fractional part. */
  get rx() { return Math.round(this.x); }
  get ry() { return Math.round(this.y); }
}
