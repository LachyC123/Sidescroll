// Asset loading with an explicit manifest, plus the sprite-clip helper the
// animation system uses. Nearest-neighbour is enforced at draw time by the
// canvas context, so nothing here rescales or pre-filters source art.

const images = new Map();

export function img(path) {
  const i = images.get(path);
  if (!i) throw new Error('asset not loaded: ' + path);
  return i;
}
export function has(path) { return images.has(path); }

export function loadImage(path) {
  if (images.has(path)) return Promise.resolve(images.get(path));
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => { images.set(path, im); res(im); };
    im.onerror = () => rej(new Error('failed to load ' + path));
    im.src = path;
  });
}

/** Load many paths, reporting 0..1 progress. Missing files reject loudly. */
export async function loadAll(paths, onProgress) {
  const uniq = [...new Set(paths)];
  let done = 0;
  await Promise.all(uniq.map(async (p) => {
    await loadImage(p);
    done++;
    if (onProgress) onProgress(done / uniq.length, p);
  }));
}

export async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error('failed to load ' + path + ': ' + r.status);
  return r.json();
}

// --------------------------------------------------------------------- clips
/**
 * A Clip is a horizontal strip of equal frames.
 * Timing is authored per clip; Section 8 forbids playing every frame evenly
 * "by default", so clips carry an optional per-frame duration table and
 * event frames that fire callbacks (hitboxes, footsteps, dust).
 */
export class Clip {
  constructor(path, frames, fw, fh, fps, loop = true, opts = {}) {
    this.path = path; this.frames = frames; this.fw = fw; this.fh = fh;
    this.fps = fps; this.loop = loop;
    // Offset into the source strip, so one sheet can supply several clips.
    // The jump sheet is a single 15-frame sequence; the controller needs it
    // split into rise/apex/fall so the pose follows physics state, not a timer.
    this.offset = opts.offset || 0;
    this.durations = opts.durations || null;   // ms per frame, else 1000/fps
    this.events = opts.events || {};           // frameIndex -> event name
    this.total = this.durations
      ? this.durations.reduce((a, b) => a + b, 0)
      : frames * (1000 / fps);
  }
  frameAt(tMs) {
    if (this.frames <= 1) return 0;
    let t = tMs;
    if (this.loop) t = ((t % this.total) + this.total) % this.total;
    else if (t >= this.total) return this.frames - 1;
    if (!this.durations) return Math.min(this.frames - 1, Math.floor(t / (1000 / this.fps)));
    let acc = 0;
    for (let i = 0; i < this.frames; i++) {
      acc += this.durations[i];
      if (t < acc) return i;
    }
    return this.frames - 1;
  }
  finished(tMs) { return !this.loop && tMs >= this.total; }
}

/**
 * Draw one frame of a clip, anchored at (x, y) = the clip's anchor point,
 * flipped horizontally when facing left.
 */
export function drawClip(ctx, clip, frame, x, y, anchorX, anchorY, flip, alpha = 1) {
  const im = img(clip.path);
  const sx = (clip.offset + frame) * clip.fw;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  if (flip) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(-1, 1);
    ctx.drawImage(im, sx, 0, clip.fw, clip.fh,
                  -(clip.fw - anchorX), -anchorY, clip.fw, clip.fh);
    ctx.restore();
  } else {
    ctx.drawImage(im, sx, 0, clip.fw, clip.fh,
                  Math.round(x) - anchorX, Math.round(y) - anchorY, clip.fw, clip.fh);
  }
  if (alpha !== 1) ctx.globalAlpha = 1;
}

/** Simple animation cursor with event dispatch. */
export class Anim {
  constructor() { this.clip = null; this.t = 0; this.lastFrame = -1; this.onEvent = null; }
  play(clip, restart = false) {
    if (this.clip === clip && !restart) return;
    this.clip = clip; this.t = 0; this.lastFrame = -1;
  }
  update(dtMs) {
    if (!this.clip) return;
    this.t += dtMs;
    const f = this.clip.frameAt(this.t);
    if (f !== this.lastFrame) {
      const ev = this.clip.events[f];
      if (ev && this.onEvent) this.onEvent(ev, f);
      this.lastFrame = f;
    }
  }
  get frame() { return this.clip ? this.clip.frameAt(this.t) : 0; }
  get done() { return this.clip ? this.clip.finished(this.t) : true; }
}
