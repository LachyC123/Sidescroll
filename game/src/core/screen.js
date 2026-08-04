// The 384x216 internal canvas and its integer-scaled presentation.
// Section 8: nearest-neighbour only, integer scaling preferred, never a
// non-uniform stretch. When the window aspect does not divide evenly we
// letterbox rather than distort the pixel grid.

export const W = 384;
export const H = 216;

export const canvas = document.getElementById('c');
export const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

let scale = 1;
export function getScale() { return scale; }

// Section 8 prefers integer scaling and forbids a non-uniform stretch. Both
// hold here: scaling is always uniform, and integer is used unless it would
// throw away most of the screen -- which is exactly what happens on a phone,
// where the largest integer scale is often 1 and leaves the game a postage
// stamp in the middle of a tall display. Settings can force integer back on.
export let preferInteger = true;
export function setPreferInteger(v) { preferInteger = !!v; fit(); }

function fit() {
  const wrap = document.getElementById('wrap');
  if (!wrap) return;
  const aw = wrap.clientWidth, ah = wrap.clientHeight;
  if (aw <= 0 || ah <= 0) return;

  const raw = Math.min(aw / W, ah / H);
  const int = Math.floor(raw);
  // how much of the fitted area an integer scale would give up
  const waste = int >= 1 ? (raw - int) / raw : 1;

  scale = (int < 1) ? raw
        : (preferInteger && waste <= 0.2) ? int
        : raw;

  canvas.style.width = Math.round(W * scale) + 'px';
  canvas.style.height = Math.round(H * scale) + 'px';
}

addEventListener('resize', fit);
addEventListener('orientationchange', () => setTimeout(fit, 120));
if (window.visualViewport) visualViewport.addEventListener('resize', fit);
fit();
export { fit };

/** Convert a client-space point (pointer/touch) into internal canvas pixels. */
export function toCanvas(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  return { x: (clientX - r.left) / (r.width / W), y: (clientY - r.top) / (r.height / H) };
}

export function clear(colour = '#07060b') {
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- screen fx
// Shake and flash live here so accessibility settings can scale them in one
// place (Section 8: players can reduce or disable shake, flash and hit-stop
// independently).
let shakeAmp = 0, shakeUntil = 0, shakeSeed = 0;
let flashCol = null, flashUntil = 0, flashDur = 1;
export const fxScale = { shake: 1, flash: 1 };

export function shake(px, ms) {
  const amp = px * fxScale.shake;
  if (amp <= 0) return;
  const now = performance.now();
  // a bigger shake overrides a smaller one still running, it never stacks
  if (amp >= shakeAmp || now > shakeUntil) { shakeAmp = amp; shakeSeed = Math.random() * 999; }
  shakeUntil = Math.max(shakeUntil, now + ms);
}

export function flash(colour, ms) {
  if (fxScale.flash <= 0) return;
  flashCol = colour; flashDur = ms; flashUntil = performance.now() + ms;
}

/** Camera offset contributed by shake, in whole pixels. */
export function shakeOffset() {
  const now = performance.now();
  if (now > shakeUntil || shakeAmp <= 0) { shakeAmp = 0; return { x: 0, y: 0 }; }
  const left = (shakeUntil - now);
  const decay = Math.min(1, left / 90);
  const a = shakeAmp * decay;
  const t = now * 0.06 + shakeSeed;
  return { x: Math.round(Math.sin(t * 1.7) * a), y: Math.round(Math.cos(t * 2.3) * a * 0.6) };
}

export function drawFlash() {
  const now = performance.now();
  if (now > flashUntil || !flashCol) return;
  const a = ((flashUntil - now) / flashDur) * 0.55 * fxScale.flash;
  ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.fillStyle = flashCol;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}
