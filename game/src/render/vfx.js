// VFX. Section 10: particles inherit the pixel grid and never become smooth
// vector confetti; a normal hit uses fewer than 12 visible particles;
// colours are biome-aware but stay functional -- heal always reads as heal.
//
// Everything is drawn as 1x1 or 2x2 integer rects, pooled, and capped.

const MAX = 150;

const FAMILIES = {
  // sword
  spark:   { life: [110, 190], size: 1, grav: 90,  drag: 0.9,  n: [5, 8],  speed: [40, 110], cols: ['#fff6d8', '#ffd97a', '#e8a13c'] },
  spark_heavy: { life: [150, 260], size: 2, grav: 110, drag: 0.88, n: [8, 11], speed: [60, 150], cols: ['#ffffff', '#ffe9a8', '#e07d3a'] },
  spark_armour: { life: [120, 200], size: 1, grav: 140, drag: 0.9, n: [6, 9], speed: [70, 160], cols: ['#dff2ff', '#a8d8ff', '#7fb0e0'] },
  // movement
  dust:    { life: [180, 300], size: 1, grav: -8,  drag: 0.84, n: [3, 5],  speed: [12, 34], cols: ['#cbbfa8', '#a99a82'] },
  puff:    { life: [200, 320], size: 2, grav: -14, drag: 0.82, n: [4, 6],  speed: [16, 40], cols: ['#e2d8c4', '#bdb09a'] },
  land:    { life: [200, 340], size: 1, grav: -6,  drag: 0.8,  n: [6, 9],  speed: [26, 62], cols: ['#d6c9b0', '#a2947c'] },
  land_heavy: { life: [260, 420], size: 2, grav: -6, drag: 0.79, n: [10, 14], speed: [40, 96], cols: ['#e8dcc4', '#b0a288', '#8a7d66'] },
  skid:    { life: [140, 240], size: 1, grav: -4,  drag: 0.86, n: [2, 4],  speed: [10, 28], cols: ['#c9bda6'] },
  // world
  splash:  { life: [200, 360], size: 1, grav: 130, drag: 0.9,  n: [7, 11], speed: [40, 100], cols: ['#bfe9ff', '#79c4ee', '#4a9ccc'] },
  mud:     { life: [240, 400], size: 2, grav: 160, drag: 0.86, n: [5, 8],  speed: [26, 66], cols: ['#6b5a3a', '#4c4028', '#8a7548'] },
  debris:  { life: [280, 480], size: 2, grav: 220, drag: 0.93, n: [6, 10], speed: [50, 130], cols: ['#8f8577', '#6a6156', '#b3a892'] },
  leaf:    { life: [700, 1300], size: 1, grav: 8,  drag: 0.99, n: [1, 2],  speed: [6, 18], cols: ['#7fa350', '#5f8038', '#a8bd63'] },
  ash:     { life: [900, 1600], size: 1, grav: 5,  drag: 0.995, n: [1, 2], speed: [4, 12], cols: ['#9a9188', '#6d665f'] },
  // status
  heal:    { life: [420, 700], size: 1, grav: -34, drag: 0.95, n: [8, 12], speed: [10, 30], cols: ['#a8ffc0', '#5fe08c', '#d8ffe6'] },
  poison:  { life: [400, 700], size: 1, grav: -22, drag: 0.95, n: [5, 8],  speed: [8, 26], cols: ['#9adf5a', '#6aa832', '#c8f08a'] },
  vow:     { life: [380, 620], size: 1, grav: -40, drag: 0.94, n: [6, 10], speed: [14, 40], cols: ['#ffd97a', '#ffb347', '#fff2c4'] },
  // cues
  pickup:  { life: [260, 420], size: 1, grav: -50, drag: 0.93, n: [5, 8],  speed: [14, 36], cols: ['#ffe9a8', '#ffcf5c'] },
  secret:  { life: [500, 800], size: 1, grav: -30, drag: 0.96, n: [10, 14], speed: [18, 46], cols: ['#c8b4ff', '#9a7fe8', '#e6dcff'] },
  blocked: { life: [160, 240], size: 1, grav: 0,   drag: 0.9,  n: [4, 6],  speed: [18, 40], cols: ['#ff8f6a', '#d95a3a'] },
};

export class VFX {
  constructor() {
    this.p = new Array(MAX);
    for (let i = 0; i < MAX; i++) {
      this.p[i] = { on: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1, c: '#fff', s: 1, g: 0, d: 1 };
    }
    this.count = 0;
    this.rings = [];      // expanding pixel rings for pickups/secret pulses
  }

  clear() { for (const q of this.p) q.on = false; this.count = 0; this.rings.length = 0; }

  /** Emit a family at a point, optionally biased along a direction. */
  emit(family, x, y, opts = {}) {
    const f = FAMILIES[family];
    if (!f) return;
    const n = opts.count ?? (f.n[0] + Math.floor(Math.random() * (f.n[1] - f.n[0] + 1)));
    const dir = opts.dir;               // radians, if the burst is directional
    const spread = opts.spread ?? (dir === undefined ? Math.PI * 2 : 1.5);
    for (let i = 0; i < n; i++) {
      const q = this.alloc();
      if (!q) return;
      const a = (dir === undefined ? Math.random() * Math.PI * 2
                                   : dir + (Math.random() - 0.5) * spread);
      const sp = f.speed[0] + Math.random() * (f.speed[1] - f.speed[0]);
      q.on = true;
      q.x = x + (Math.random() - 0.5) * (opts.jitter ?? 2);
      q.y = y + (Math.random() - 0.5) * (opts.jitter ?? 2);
      q.vx = Math.cos(a) * sp * (opts.speedScale ?? 1);
      q.vy = Math.sin(a) * sp * (opts.speedScale ?? 1);
      q.t = 0;
      q.life = f.life[0] + Math.random() * (f.life[1] - f.life[0]);
      q.c = opts.colour || f.cols[Math.floor(Math.random() * f.cols.length)];
      q.s = f.size;
      q.g = f.grav;
      q.d = f.drag;
    }
  }

  alloc() {
    for (let i = 0; i < MAX; i++) if (!this.p[i].on) return this.p[i];
    return null;
  }

  ring(x, y, colour, maxR = 14, ms = 300) {
    if (this.rings.length > 8) this.rings.shift();
    this.rings.push({ x, y, c: colour, r: 1, maxR, t: 0, ms });
  }

  update(dt) {
    const dtms = dt * 1000;
    let n = 0;
    for (const q of this.p) {
      if (!q.on) continue;
      q.t += dtms;
      if (q.t >= q.life) { q.on = false; continue; }
      q.vy += q.g * dt;
      const k = Math.pow(q.d, dtms / 16.67);
      q.vx *= k; q.vy *= k;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      n++;
    }
    this.count = n;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dtms;
      r.r = 1 + (r.maxR - 1) * (r.t / r.ms);
      if (r.t >= r.ms) this.rings.splice(i, 1);
    }
  }

  draw(ctx, camX, camY) {
    for (const q of this.p) {
      if (!q.on) continue;
      const k = 1 - q.t / q.life;
      ctx.globalAlpha = k > 0.35 ? 1 : k / 0.35;
      ctx.fillStyle = q.c;
      ctx.fillRect(Math.round(q.x - camX), Math.round(q.y - camY), q.s, q.s);
    }
    ctx.globalAlpha = 1;
    // pixel rings: drawn as 8 points on a circle, never a smooth stroke
    for (const r of this.rings) {
      const a = 1 - r.t / r.ms;
      ctx.globalAlpha = a;
      ctx.fillStyle = r.c;
      for (let i = 0; i < 10; i++) {
        const th = (i / 10) * Math.PI * 2;
        ctx.fillRect(Math.round(r.x + Math.cos(th) * r.r - camX),
                     Math.round(r.y + Math.sin(th) * r.r * 0.7 - camY), 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }
}

export const vfx = new VFX();
