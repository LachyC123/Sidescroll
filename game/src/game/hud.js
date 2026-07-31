// HUD. Section 9 is a size budget as much as a layout: health block at most
// 18% of screen width, Road Ash fades after it changes rather than sitting
// bright, the boss bar exists only during a boss, and the chapter cue shows for
// two to four seconds and then lives in the pause road screen instead.

import { W, H } from '../core/screen.js';
import { text, textWidth } from '../core/text.js';
import { settings } from '../core/settings.js';

const MAX_HEALTH_W = Math.floor(W * 0.18);   // 69px

let ashShown = 0, ashFade = 0, lastAsh = -1;

export function drawHUD(ctx, world) {
  const p = world.player;

  // ---------------------------------------------------------------- health
  const pips = p.maxHealth;
  const pipW = Math.max(3, Math.min(7, Math.floor((MAX_HEALTH_W - 8) / Math.max(1, pips)) - 1));
  const x0 = 6, y0 = 6;
  for (let i = 0; i < pips; i++) {
    const filled = i < p.health;
    const x = x0 + i * (pipW + 1);
    ctx.fillStyle = '#0b0910';
    ctx.fillRect(x - 1, y0 - 1, pipW + 2, 8);
    if (filled) {
      ctx.fillStyle = i === p.health - 1 && p.health <= 2 ? '#ff6a6a' : '#d8484f';
      ctx.fillRect(x, y0, pipW, 6);
      ctx.fillStyle = '#ff9aa0';
      ctx.fillRect(x, y0, pipW, 2);
    } else {
      ctx.fillStyle = '#2e2530';
      ctx.fillRect(x, y0, pipW, 6);
    }
  }

  // healing charges, as small marks under the health block
  for (let i = 0; i < Math.min(6, p.healCharges); i++) {
    const x = x0 + i * 5;
    ctx.fillStyle = '#0b0910';
    ctx.fillRect(x - 1, y0 + 8, 5, 5);
    ctx.fillStyle = '#5fe08c';
    ctx.fillRect(x, y0 + 9, 3, 3);
  }
  if (p.healCharges > 6) {
    text(ctx, '+' + (p.healCharges - 6), x0 + 32, y0 + 8, { colour: '#5fe08c', shadow: '#000' });
  }

  // ------------------------------------------------- vow meter (only if used)
  const ash = p.vowTier('ash');
  if (ash && p.ashStacks > 0) {
    const wpx = 28;
    const k = Math.min(1, p.ashStacks / ash.stacks);
    ctx.fillStyle = '#0b0910';
    ctx.fillRect(x0 - 1, y0 + 15, wpx + 2, 4);
    ctx.fillStyle = '#c8a24a';
    ctx.fillRect(x0, y0 + 16, Math.round(wpx * k), 2);
  }

  // ------------------------------------------------------------- road ash
  if (p.roadAsh !== lastAsh) {
    if (lastAsh >= 0) ashFade = 2.6;
    lastAsh = p.roadAsh;
  }
  if (ashFade > 0) ashFade -= 1 / 60;
  const alpha = ashFade > 0 ? 1 : 0.42;
  ctx.globalAlpha = alpha;
  const label = String(p.roadAsh);
  ctx.fillStyle = '#c8a24a';
  ctx.fillRect(W - 8 - textWidth(label) - 6, 7, 3, 3);
  text(ctx, label, W - 6, 6, { align: 'right', colour: '#e8dcc0', shadow: '#000' });
  ctx.globalAlpha = 1;

  // ------------------------------------------------------------- boss bar
  if (world.boss && !world.boss.dead) {
    const b = world.boss;
    const bw = 150, bx = Math.round((W - bw) / 2), by = H - 18;
    ctx.fillStyle = 'rgba(8,6,12,0.75)';
    ctx.fillRect(bx - 2, by - 9, bw + 4, 16);
    text(ctx, b.bossDef.name, W / 2, by - 8, { align: 'centre', colour: '#e8dcd0', shadow: '#000' });
    ctx.fillStyle = '#2a1c22';
    ctx.fillRect(bx, by + 1, bw, 4);
    const k = Math.max(0, b.health / b.maxHealth);
    ctx.fillStyle = '#d8484f';
    ctx.fillRect(bx, by + 1, Math.round(bw * k), 4);
    ctx.fillStyle = '#ff9aa0';
    ctx.fillRect(bx, by + 1, Math.round(bw * k), 1);
  }

  // ------------------------------------------------------- objective cue
  if (world.chapterCue.t < 3.4) {
    const t = world.chapterCue.t;
    const a = t < 0.4 ? t / 0.4 : t > 2.8 ? Math.max(0, (3.4 - t) / 0.6) : 1;
    ctx.globalAlpha = a;
    const ch = world.ch;
    text(ctx, ch.num === 'E' ? 'EPILOGUE' : 'CHAPTER ' + ch.num, W / 2, 26,
         { align: 'centre', colour: '#9a8f7e', shadow: '#000' });
    text(ctx, ch.name, W / 2, 36, { align: 'centre', colour: '#f0e6d2', shadow: '#000' });
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------- banner
  if (world.banner) {
    const b = world.banner;
    const a = b.t < 0.3 ? b.t / 0.3 : b.t > b.dur - 0.5 ? Math.max(0, (b.dur - b.t) / 0.5) : 1;
    ctx.globalAlpha = a;
    const y = H - 40;
    const wpx = textWidth(b.text);
    ctx.fillStyle = 'rgba(8,6,12,0.7)';
    ctx.fillRect((W - wpx) / 2 - 5, y - 3, wpx + 10, 13);
    text(ctx, b.text, W / 2, y, { align: 'centre', colour: '#e8dcc0', shadow: '#000' });
    ctx.globalAlpha = 1;
  }

  // secret proximity pulse from the Vow of Bells: a soft UI cue, not a marker
  if (world.secretPulse > 0) {
    ctx.globalAlpha = Math.min(0.6, world.secretPulse);
    ctx.fillStyle = '#c8b4ff';
    ctx.fillRect(W / 2 - 6, 2, 12, 1);
    ctx.globalAlpha = 1;
  }

  if (settings.video.showFps && world.fps) {
    text(ctx, Math.round(world.fps) + ' FPS', W - 6, H - 10,
         { align: 'right', colour: '#6b6376' });
  }
}
