// Menu framework.
//
// Section 9's UI rules, enforced here rather than per screen: every item has a
// distinct selected / focused / disabled / locked appearance that does not rely
// on colour alone, transitions complete in 100-220ms and stay responsive, menus
// remember their last valid focus when returning from a child screen, and every
// path works from keyboard and gamepad with no mouse-only blocker.

import * as In from '../core/input.js';
import { sfx } from '../core/audio.js';
import { W, H } from '../core/screen.js';
import { text, textWidth, textBlock, CH_H } from '../core/text.js';

export const PAL = {
  bg: '#0b0910',
  panel: '#171320',
  panelEdge: '#2c2438',
  ink: '#e8dcc8',
  dim: '#8b8194',
  faint: '#5a5266',
  accent: '#c8a24a',
  accentInk: '#0b0910',
  danger: '#d8484f',
  good: '#5fe08c',
};

const focusMemory = new Map();

export class Menu {
  constructor(id, items, opts = {}) {
    this.id = id;
    this.items = items;
    this.i = Math.min(focusMemory.get(id) ?? 0, Math.max(0, items.length - 1));
    this.onCancel = opts.onCancel || null;
    this.columns = opts.columns || 1;
    this.wrap = opts.wrap !== false;
    this.t = 0;
    this.ensureValid(1);
  }

  setItems(items) {
    this.items = items;
    this.i = Math.min(this.i, Math.max(0, items.length - 1));
    this.ensureValid(1);
  }

  get current() { return this.items[this.i]; }

  ensureValid(dir) {
    let guard = 0;
    while (this.items.length && this.items[this.i]
           && (this.items[this.i].disabled || this.items[this.i].separator)
           && guard++ < this.items.length) {
      this.i = (this.i + dir + this.items.length) % this.items.length;
    }
    focusMemory.set(this.id, this.i);
  }

  move(dir) {
    if (!this.items.length) return;
    const start = this.i;
    do {
      this.i = (this.i + dir + this.items.length) % this.items.length;
      if (!this.wrap && (this.i === 0 && dir > 0)) break;
    } while ((this.items[this.i].disabled || this.items[this.i].separator)
             && this.i !== start);
    if (this.i !== start) sfx('ui_move');
    focusMemory.set(this.id, this.i);
  }

  update(dt) {
    this.t += dt;
    if (In.pressed('up')) this.move(-1);
    if (In.pressed('down')) this.move(1);

    const it = this.current;
    if (it && it.kind === 'slider') {
      if (In.pressed('left')) { it.onChange(-1); sfx('ui_move'); }
      if (In.pressed('right')) { it.onChange(1); sfx('ui_move'); }
    } else if (it && it.kind === 'choice') {
      if (In.pressed('left')) { it.onChange(-1); sfx('ui_move'); }
      if (In.pressed('right')) { it.onChange(1); sfx('ui_move'); }
    }

    if (In.pressed('attack') || In.pressed('interact')) {
      if (it && !it.disabled && it.onSelect) {
        if (it.locked) { sfx('ui_invalid'); }
        else { sfx('ui_confirm'); it.onSelect(); }
      } else sfx('ui_invalid');
    }
    if (In.pressed('cancel') || In.pressed('pause')) {
      if (this.onCancel) { sfx('ui_cancel'); this.onCancel(); }
    }
  }

  draw(ctx, x, y, opts = {}) {
    const lh = opts.lineHeight || 13;
    const w = opts.width || 150;
    this.items.forEach((it, idx) => {
      const iy = y + idx * lh;
      if (it.separator) {
        ctx.fillStyle = PAL.panelEdge;
        ctx.fillRect(x, iy + 4, w, 1);
        return;
      }
      const sel = idx === this.i;
      const ink = it.disabled ? PAL.faint : it.locked ? PAL.dim : sel ? PAL.accentInk : PAL.ink;

      if (sel) {
        // selection is a filled bar *and* a caret, so it never depends on colour
        ctx.fillStyle = PAL.accent;
        ctx.fillRect(x - 3, iy - 2, w + 6, lh - 2);
      }
      const caret = sel ? '>' : it.locked ? '#' : it.disabled ? '-' : ' ';
      text(ctx, caret, x - 1, iy, { colour: ink });
      text(ctx, it.label, x + 8, iy, { colour: ink });

      if (it.value !== undefined) {
        const v = typeof it.value === 'function' ? it.value() : it.value;
        text(ctx, String(v), x + w - 2, iy, { align: 'right', colour: ink });
      }
      if (it.kind === 'slider') {
        const v = it.get();
        const bw = 34, bx = x + w - 2 - bw;
        ctx.fillStyle = sel ? 'rgba(11,9,16,0.35)' : PAL.panelEdge;
        ctx.fillRect(bx, iy + 2, bw, 3);
        ctx.fillStyle = ink;
        ctx.fillRect(bx, iy + 2, Math.round(bw * v), 3);
        // arrows make the adjustable-ness visible without colour
        text(ctx, '<', bx - 8, iy, { colour: ink });
        text(ctx, '>', x + w + 1, iy, { colour: ink });
      }
    });
    // hint line for the focused item
    const it = this.current;
    if (it && it.hint && opts.hintY !== undefined) {
      textBlock(ctx, it.hint, opts.hintX ?? x, opts.hintY, opts.hintW ?? (W - 40),
                { colour: PAL.dim, lineHeight: CH_H + 2 });
    }
  }
}

// ------------------------------------------------------------------ widgets
export function panel(ctx, x, y, w, h, opts = {}) {
  ctx.fillStyle = opts.fill || 'rgba(11,9,16,0.90)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = opts.edge || PAL.panelEdge;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
  // corner ticks, so the frame reads as a pixel panel rather than a box
  ctx.fillStyle = opts.corner || PAL.accent;
  ctx.fillRect(x, y, 2, 1); ctx.fillRect(x, y, 1, 2);
  ctx.fillRect(x + w - 2, y, 2, 1); ctx.fillRect(x + w - 1, y, 1, 2);
  ctx.fillRect(x, y + h - 1, 2, 1); ctx.fillRect(x, y + h - 2, 1, 2);
  ctx.fillRect(x + w - 2, y + h - 1, 2, 1); ctx.fillRect(x + w - 1, y + h - 2, 1, 2);
}

export function title(ctx, s, y, colour) {
  text(ctx, s, W / 2, y, { align: 'centre', colour: colour || PAL.ink, shadow: '#000' });
  const w = textWidth(s);
  ctx.fillStyle = PAL.panelEdge;
  ctx.fillRect((W - w) / 2 - 6, y + 9, w + 12, 1);
}

export function footer(ctx, pairs) {
  const parts = pairs.map(([a, l]) => `${In.glyph(a)} ${l}`);
  text(ctx, parts.join('   '), W / 2, H - 10,
       { align: 'centre', colour: PAL.faint });
}

export function tabs(ctx, names, active, y) {
  const total = names.reduce((a, n) => a + textWidth(n) + 12, 0);
  let x = Math.round((W - total) / 2);
  names.forEach((n, i) => {
    const w = textWidth(n) + 12;
    if (i === active) {
      ctx.fillStyle = PAL.accent;
      ctx.fillRect(x, y - 2, w, 11);
    }
    text(ctx, n, x + 6, y, { colour: i === active ? PAL.accentInk : PAL.dim });
    x += w;
  });
}
