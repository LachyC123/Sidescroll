// Tilemap with the six authored layers of Section 7.
//
//   1 collision   invisible gameplay geometry only
//   2 ground art  tiles that visually explain that collision
//   3 midground   non-colliding set dressing
//   4 gameplay    enemies/hazards/pickups (owned by the level, not here)
//   5 foreground  occasional framing, drawn after entities
//   6 parallax    see parallax.js
//
// Collision is never derived from decorative alpha: solidity comes from the
// collision layer alone, and the art layer is autotiled to match it.

import { img } from '../core/assets.js';

export const TS = 16;

// collision cell values
export const AIR = 0;
export const SOLID = 1;
export const PLATFORM = 2;   // one-way, from above
export const HAZARD = 3;     // damaging surface (spikes, poison, lava)
export const WATER = 4;      // slows, no damage
export const LADDER = 5;

export class TileMap {
  constructor(w, h, tileset) {
    this.w = w; this.h = h;
    this.tileset = tileset;          // entry from data/tilesets.json
    this.col = new Uint8Array(w * h);
    this.ground = new Int16Array(w * h).fill(-1);
    this.mid = new Int16Array(w * h).fill(-1);
    this.fore = new Int16Array(w * h).fill(-1);
    this._cols = tileset ? tileset.cols : 1;
  }

  idx(x, y) { return y * this.w + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  get(x, y) {
    if (x < 0 || x >= this.w) return SOLID;      // world edges are walls
    if (y < 0) return AIR;                        // open sky
    if (y >= this.h) return AIR;                  // below the map is a pit
    return this.col[this.idx(x, y)];
  }
  set(x, y, v) { if (this.inside(x, y)) this.col[this.idx(x, y)] = v; }

  isSolid(x, y) { return this.get(x, y) === SOLID; }
  isPlatform(x, y) { return this.get(x, y) === PLATFORM; }
  isBlocking(x, y) { const v = this.get(x, y); return v === SOLID; }

  /** World-pixel probe. */
  solidAt(px, py) { return this.isSolid(Math.floor(px / TS), Math.floor(py / TS)); }
  cellAt(px, py) { return this.get(Math.floor(px / TS), Math.floor(py / TS)); }

  /** How many solid rows sit above (x, y) before open air. */
  depthBelowSurface(x, y) {
    let d = 0;
    for (let yy = y - 1; yy >= 0 && d < 4; yy--, d++) {
      if (!this.isSolid(x, yy)) break;
    }
    return d;
  }

  // ------------------------------------------------------------- autotiling
  /**
   * Derive ground art from the collision layer using the role table the
   * classifier produced, so every edge and corner reads at a glance and no
   * decorative tile can accidentally imply collision.
   */
  autotile(rng) {
    const R = this.tileset.roles;
    const capVars = R.cap_vars && R.cap_vars.length ? R.cap_vars : [R.cap];
    const bodyVars = R.body_vars && R.body_vars.length ? R.body_vars : [R.body];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = this.idx(x, y);
        const v = this.col[i];
        if (v !== SOLID) { if (v !== PLATFORM) this.ground[i] = -1; continue; }
        const up = this.isSolid(x, y - 1);
        const left = this.isSolid(x - 1, y);
        const right = this.isSolid(x + 1, y);
        const down = this.isSolid(x, y + 1);
        let t;
        if (!up) {
          t = !left ? R.cap_left : !right ? R.cap_right
              : (rng ? rng.pick(capVars) : R.cap);
        } else if (!down) {
          t = !left ? R.bot_left : !right ? R.bot_right : R.bot;
        } else {
          // Variation belongs near the surface. Deep fill uses one plain tile:
          // scattering detail tiles all the way down turns the subsurface into
          // repeating noise that competes with the gameplay plane for attention.
          const depth = this.depthBelowSurface(x, y);
          t = !left ? R.body_left : !right ? R.body_right
              : (rng && depth <= 2 ? rng.pick(bodyVars) : R.body);
        }
        this.ground[i] = t;
      }
    }
    // one-way platforms use the cap row so their surface reads as standable
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = this.idx(x, y);
        if (this.col[i] !== PLATFORM) continue;
        const left = this.get(x - 1, y) === PLATFORM;
        const right = this.get(x + 1, y) === PLATFORM;
        this.ground[i] = !left ? R.cap_left : !right ? R.cap_right : R.cap;
      }
    }
  }

  // ---------------------------------------------------------------- drawing
  drawLayer(ctx, layer, camX, camY, tint) {
    const arr = layer === 'ground' ? this.ground : layer === 'mid' ? this.mid : this.fore;
    const sheet = img(this.tileset.image);
    const cols = this._cols;
    const x0 = Math.max(0, Math.floor(camX / TS));
    const y0 = Math.max(0, Math.floor(camY / TS));
    const x1 = Math.min(this.w - 1, Math.ceil((camX + 384) / TS));
    const y1 = Math.min(this.h - 1, Math.ceil((camY + 216) / TS));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = arr[this.idx(x, y)];
        if (t < 0) continue;
        const sx = (t % cols) * TS, sy = Math.floor(t / cols) * TS;
        ctx.drawImage(sheet, sx, sy, TS, TS,
                      x * TS - camX, y * TS - camY, TS, TS);
      }
    }
  }

  /** Debug overlay: collision classes, for the evidence screenshots. */
  drawCollision(ctx, camX, camY) {
    const colours = { 1: 'rgba(255,60,60,.45)', 2: 'rgba(60,200,255,.45)',
                      3: 'rgba(255,160,0,.5)', 4: 'rgba(60,120,255,.35)',
                      5: 'rgba(200,255,60,.4)' };
    const x0 = Math.max(0, Math.floor(camX / TS));
    const y0 = Math.max(0, Math.floor(camY / TS));
    const x1 = Math.min(this.w - 1, Math.ceil((camX + 384) / TS));
    const y1 = Math.min(this.h - 1, Math.ceil((camY + 216) / TS));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const v = this.col[this.idx(x, y)];
        if (!v) continue;
        ctx.fillStyle = colours[v] || 'rgba(255,0,255,.4)';
        ctx.fillRect(x * TS - camX, y * TS - camY, TS, TS);
      }
    }
  }
}

/**
 * Swept AABB move against the collision layer.
 * Returns the collision flags so the caller can zero the right velocity axis.
 * Corner correction (Section 5) nudges the body around a single-pixel overhead
 * catch rather than stopping a jump dead.
 */
export function moveBody(map, body, dx, dy, opts = {}) {
  const res = { hitX: false, hitY: false, grounded: false, ceiling: false };
  const step = 4;   // never tunnel: advance in <= 4px slices

  // ---- X
  let remain = dx;
  while (Math.abs(remain) > 0.0001) {
    const s = Math.max(-step, Math.min(step, remain));
    remain -= s;
    body.x += s;
    if (overlapSolid(map, body)) {
      body.x -= s;
      res.hitX = true;
      break;
    }
  }

  // ---- Y
  remain = dy;
  while (Math.abs(remain) > 0.0001) {
    const s = Math.max(-step, Math.min(step, remain));
    remain -= s;
    body.y += s;
    if (overlapSolid(map, body)) {
      body.y -= s;
      if (s > 0) { res.grounded = true; }
      else {
        // corner correction: if only one edge is caught, slide around it
        const nudged = tryCornerCorrect(map, body, s);
        if (nudged) { remain += s; continue; }
        res.ceiling = true;
      }
      res.hitY = true;
      break;
    }
    // one-way platforms only stop a downward move that starts above them
    if (s > 0 && !opts.dropThrough && landsOnPlatform(map, body, s)) {
      res.grounded = true; res.hitY = true;
      break;
    }
  }
  return res;
}

function overlapSolid(map, b) {
  const x0 = Math.floor(b.x / TS), x1 = Math.floor((b.x + b.w - 0.001) / TS);
  const y0 = Math.floor(b.y / TS), y1 = Math.floor((b.y + b.h - 0.001) / TS);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) if (map.isBlocking(x, y)) return true;
  }
  return false;
}

/** Snap the body onto a one-way platform if its feet just crossed the surface. */
function landsOnPlatform(map, b, dy) {
  const feet = b.y + b.h;
  const row = Math.floor(feet / TS);
  const prevFeet = feet - dy;
  if (Math.floor(prevFeet / TS) >= row) return false;   // was already at/below
  const surface = row * TS;
  if (prevFeet > surface + 0.51) return false;
  const x0 = Math.floor(b.x / TS), x1 = Math.floor((b.x + b.w - 0.001) / TS);
  for (let x = x0; x <= x1; x++) {
    if (map.isPlatform(x, row)) { b.y = surface - b.h; return true; }
  }
  return false;
}

function tryCornerCorrect(map, b, dy) {
  // only for upward motion, and only by a pixel or two
  for (const off of [1, -1, 2, -2]) {
    b.x += off; b.y += dy;
    if (!overlapSolid(map, b)) return true;
    b.x -= off; b.y -= dy;
  }
  return false;
}

/** Is the body standing on anything solid or on a one-way surface? */
export function onGround(map, b) {
  const feet = b.y + b.h;
  const row = Math.floor((feet + 0.6) / TS);
  if (Math.abs(feet - row * TS) > 1.2 && Math.abs(feet % TS) > 1.2) {
    // not near a tile boundary: only solid tiles can hold us
  }
  const x0 = Math.floor(b.x / TS), x1 = Math.floor((b.x + b.w - 0.001) / TS);
  for (let x = x0; x <= x1; x++) {
    const v = map.get(x, row);
    if (v === SOLID) return true;
    if (v === PLATFORM && Math.abs(feet - row * TS) <= 1.5) return true;
  }
  return false;
}

/** The y of the surface directly under the body, for camera band tracking. */
export function groundBelow(map, b, maxTiles = 12) {
  const x = Math.floor((b.x + b.w / 2) / TS);
  let y = Math.floor((b.y + b.h) / TS);
  for (let i = 0; i < maxTiles; i++, y++) {
    const v = map.get(x, y);
    if (v === SOLID || v === PLATFORM) return y * TS;
  }
  return b.y + b.h;
}
