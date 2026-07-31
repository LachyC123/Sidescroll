// Parallax, to the Section 8 profile:
//
//   sky            0.00-0.05   may be static, no visible seams
//   far silhouette 0.08-0.15   lowest contrast and saturation
//   mid background 0.18-0.30   carries biome landmarks
//   near           0.40-0.60   higher contrast, never competes with collision
//   gameplay plane 1.00
//   foreground     1.05-1.20   sparse, must not hide threats
//
// Layers tile horizontally and are anchored to the bottom of the level so the
// horizon sits where the ground does, not where the canvas happens to end.

import { img } from '../core/assets.js';
import { W, H } from '../core/screen.js';

const SPEEDS = [0.04, 0.12, 0.24, 0.5];

export class Parallax {
  /**
   * @param layers  array of asset paths, far -> near
   * @param opts    {speeds, sky, yAnchor, tintTop, tintBottom, driftPxPerSec}
   */
  constructor(layers, opts = {}) {
    this.layers = layers.slice(0, 4);
    this.speeds = opts.speeds || SPEEDS.slice(-this.layers.length);
    this.sky = opts.sky || null;               // flat colour behind everything
    this.skyBottom = opts.skyBottom || null;   // optional vertical gradient
    this.yAnchor = opts.yAnchor ?? 0;          // world y the layer bottoms sit on
    this.drift = opts.drift || this.layers.map(() => 0);  // px/sec of self-motion
    this.parallaxY = opts.parallaxY ?? 0.25;   // how much vertical camera moves it
    // Section 8: far layers move toward a shared atmospheric colour, and the
    // gameplay plane keeps the strongest local contrast. Without this veil a
    // busy or bright background sheet can swallow the player's silhouette.
    this.haze = opts.haze ?? 0.24;
    this.hazeColour = opts.hazeColour || opts.sky || '#0b0910';
    this.t = 0;
  }

  update(dt) { this.t += dt; }

  draw(ctx, camX, camY) {
    if (this.sky) {
      if (this.skyBottom) {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, this.sky);
        g.addColorStop(1, this.skyBottom);
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = this.sky;
      }
      ctx.fillRect(0, 0, W, H);
    }
    for (let i = 0; i < this.layers.length; i++) {
      const im = img(this.layers[i]);
      const sp = this.speeds[i];
      const drift = (this.drift[i] || 0) * this.t;
      let ox = -(camX * sp + drift) % im.width;
      if (ox > 0) ox -= im.width;
      // Anchor the layer's bottom to the level's horizon, then let the camera
      // move it at a fraction of the vertical rate. Rounded so the layer lands
      // on whole pixels and the tiling seam never shimmers.
      const yy = Math.round(this.yAnchor - im.height - camY * sp * this.parallaxY);
      for (let x = Math.round(ox); x < W; x += im.width) {
        ctx.drawImage(im, x, yy);
      }
    }
    if (this.haze > 0) {
      ctx.globalAlpha = this.haze;
      ctx.fillStyle = this.hazeColour;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }
}

/**
 * Foreground band drawn after entities. Kept sparse and low-contrast per
 * Section 8, and it never covers the top of the play area where tells live.
 */
export class Foreground {
  constructor(path, opts = {}) {
    this.path = path;
    this.speed = opts.speed ?? 1.12;
    this.yAnchor = opts.yAnchor ?? 0;
    this.alpha = opts.alpha ?? 1;
  }
  draw(ctx, camX, camY) {
    const im = img(this.path);
    let ox = -(camX * this.speed) % im.width;
    if (ox > 0) ox -= im.width;
    const yy = Math.round(this.yAnchor - im.height - camY * this.speed);
    ctx.globalAlpha = this.alpha;
    for (let x = Math.round(ox); x < W; x += im.width) ctx.drawImage(im, x, yy);
    ctx.globalAlpha = 1;
  }
}
