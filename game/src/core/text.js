// Bitmap text. The collection ships no font, so CROWNLESS carries its own 5x7
// pixel face rather than falling back to a smoothed system font, which would
// break the pixel grid at 384x216.
//
// Each glyph is 7 rows encoded base-32: one character per row, value 0..31,
// where bit 4 is the leftmost pixel.

const B32 = '0123456789ABCDEFGHIJKLMNOPQRSTUV';

const GLYPHS = {
  A: 'EHHVHHH', B: 'UHHUHHU', C: 'EHGGGHE', D: 'UHHHHHU', E: 'VGGUGGV',
  F: 'VGGUGGG', G: 'EHGJHHE', H: 'HHHVHHH', I: 'V44444V', J: '72222IC',
  K: 'HIKOKIH', L: 'GGGGGGV', M: 'HRLHHHH', N: 'HPLJHHH', O: 'EHHHHHE',
  P: 'UHHUGGG', Q: 'EHHHLID', R: 'UHHUKIH', S: 'FGGE11U', T: 'V444444',
  U: 'HHHHHHE', V: 'HHHHHA4', W: 'HHHLLRH', X: 'HHA4AHH', Y: 'HHA4444',
  Z: 'V1248GV',
  0: 'EHJLPHE', 1: '4C4444V', 2: 'EH1248V', 3: 'V2421HE', 4: '26AIV22',
  5: 'VGU11HE', 6: '68GUHHE', 7: 'V124888', 8: 'EHHEHHE', 9: 'EHHF12C',
  ' ': '0000000', '.': '0000004', ',': '0000048', ':': '0400040', ';': '0400048',
  '!': '4444404', '?': 'EH24404', "'": '4400000', '"': 'AA00000', '-': '000E000',
  '+': '044E440', '/': '11248GG', '\\': 'GG84211', '(': '2488842', ')': '8422248',
  '[': 'E88888E', ']': 'E22222E', '<': '1248421', '>': '8421248', '=': '00E0E00',
  '%': 'H1248GH', '&': 'CIICLID', '*': '0A4E4A0', '#': 'AVAAVA0', '_': '000000V',
  '|': '4444444', '@': 'EHJLPGE', '$': '4FGE1UF', '^': '04A00000'.slice(0, 7),
};

export const CH_W = 6;   // 5px glyph + 1px advance
export const CH_H = 7;

// One pre-rendered atlas per colour, built lazily.
const atlases = new Map();
const ORDER = Object.keys(GLYPHS);

function buildAtlas(colour) {
  const cv = document.createElement('canvas');
  cv.width = ORDER.length * CH_W;
  cv.height = CH_H;
  const c = cv.getContext('2d');
  c.fillStyle = colour;
  ORDER.forEach((ch, i) => {
    const rows = GLYPHS[ch];
    for (let y = 0; y < CH_H; y++) {
      const bits = B32.indexOf(rows[y]);
      if (bits <= 0) continue;
      for (let x = 0; x < 5; x++) {
        if (bits & (1 << (4 - x))) c.fillRect(i * CH_W + x, y, 1, 1);
      }
    }
  });
  const map = new Map();
  ORDER.forEach((ch, i) => map.set(ch, i * CH_W));
  return { cv, map };
}

function atlas(colour) {
  let a = atlases.get(colour);
  if (!a) { a = buildAtlas(colour); atlases.set(colour, a); }
  return a;
}

export function textWidth(s) { return s.length * CH_W - 1; }

/**
 * Draw a string at integer pixel coordinates.
 * @param {object} opt  {colour, shadow, align:'left'|'centre'|'right', alpha}
 */
export function text(ctx, s, x, y, opt = {}) {
  s = String(s).toUpperCase();
  const colour = opt.colour || '#e8e0d2';
  let px = Math.round(x);
  const py = Math.round(y);
  if (opt.align === 'centre') px -= Math.round(textWidth(s) / 2);
  else if (opt.align === 'right') px -= textWidth(s);

  if (opt.alpha !== undefined) ctx.globalAlpha = opt.alpha;
  if (opt.shadow) {
    const sa = atlas(opt.shadow);
    blit(ctx, sa, s, px, py + 1);
  }
  blit(ctx, atlas(colour), s, px, py);
  if (opt.alpha !== undefined) ctx.globalAlpha = 1;
  return textWidth(s);
}

function blit(ctx, a, s, px, py) {
  for (let i = 0; i < s.length; i++) {
    const sx = a.map.get(s[i]);
    if (sx === undefined) continue;
    ctx.drawImage(a.cv, sx, 0, 5, CH_H, px + i * CH_W, py, 5, CH_H);
  }
}

/** Word-wrap into lines no wider than `maxPx`. */
export function wrap(s, maxPx) {
  const words = String(s).toUpperCase().split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (textWidth(t) > maxPx && cur) { lines.push(cur); cur = w; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Multi-line draw; returns the height consumed. */
export function textBlock(ctx, s, x, y, maxPx, opt = {}) {
  const lines = wrap(s, maxPx);
  const lh = opt.lineHeight || CH_H + 3;
  lines.forEach((ln, i) => text(ctx, ln, x, y + i * lh, opt));
  return lines.length * lh;
}
