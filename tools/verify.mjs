// Browser verification harness.
//
// Section 12 requires evidence at every gameplay gate: a runnable build, a
// capture of the changed behaviour at native scale, collision-overlay
// screenshots where geometry changed, and test results. This drives the real
// game in Chromium, exercises the flow, and writes those screenshots.
//
//   node tools/verify.mjs [--url http://localhost:8099/game/] [--out shots]

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : d;
};
const URL = arg('url', 'http://localhost:8099/game/');
const OUT = arg('out', 'shots');
const ONLY = arg('only', null);

fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? '  -- ' + detail : ''}`);
}

// The pinned browser lives under a versioned directory; find it rather than
// letting playwright download its own.
function findChrome() {
  const root = '/opt/pw-browsers';
  if (!fs.existsSync(root)) return undefined;
  for (const d of fs.readdirSync(root)) {
    const p = path.join(root, d, 'chrome-linux', 'chrome');
    if (d.startsWith('chromium-') && fs.existsSync(p)) return p;
  }
  return undefined;
}
const browser = await chromium.launch({ executablePath: findChrome() });
const page = await browser.newPage({ viewport: { width: 1152, height: 648 } });

page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
});

await page.goto(URL, { waitUntil: 'load' });

// wait for the loader to finish
await page.waitForFunction(() => window.__crownless, null, { timeout: 60000 });
check('game boots and exposes flow', true);

const shot = async (name) => {
  const el = await page.$('#c');
  await el.screenshot({ path: path.join(OUT, name + '.png') });
};

const key = async (k, ms = 60) => {
  await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  await page.keyboard.up(k);
  await page.waitForTimeout(40);
};
const hold = async (k, ms) => {
  await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  await page.keyboard.up(k);
};
/**
 * Drive the focused menu to a labelled item with real key presses, then
 * confirm. This exercises keyboard navigation rather than calling the
 * handler directly, which is the point of the Section 13 "no mouse-only
 * blocker" check.
 */
const selectByLabel = async (label) => {
  for (let i = 0; i < 24; i++) {
    const cur = await page.evaluate(() => {
      const m = window.__crownless.screen && window.__crownless.screen.menu;
      return m && m.current ? m.current.label : null;
    });
    if (cur === null) throw new Error('no menu focused when looking for ' + label);
    if (cur === label) { await key('KeyJ'); await page.waitForTimeout(250); return true; }
    await key('ArrowDown');
  }
  throw new Error('menu item not reachable: ' + label);
};

const state = () => page.evaluate(() => {
  const f = window.__crownless;
  const w = f.world;
  return {
    screen: f.screenName,
    hasWorld: !!w,
    chapter: w ? w.ch.id : null,
    chapterName: w ? w.ch.name : null,
    px: w ? Math.round(w.player.x) : null,
    py: w ? Math.round(w.player.y) : null,
    pstate: w ? w.player.state : null,
    health: w ? w.player.health : null,
    enemies: w ? w.enemies.length : 0,
    grounded: w ? w.player.grounded : null,
    fps: Math.round(f.fps),
    width: w ? w.c.width : null,
    secrets: w ? w.c.secrets : null,
    checkpoints: w ? w.c.checkpoints.length : null,
    decor: w ? w.c.decor.length : null,
  };
});

// ---------------------------------------------------------------- boot/title
await page.waitForTimeout(900);
await shot('01-boot');
await key('KeyJ');
await page.waitForTimeout(700);
let s = await state();
check('reaches title screen', s.screen === 'title', s.screen);
await shot('02-title');

// ------------------------------------------------------------------ new game
await selectByLabel('NEW GAME');
s = await state();
check('opens new game screen', s.screen === 'newgame', s.screen);
await shot('03-newgame');

await selectByLabel('CHOOSE A SLOT');
s = await state();
check('opens slot screen', s.screen === 'slots', s.screen);
await shot('04-slots');

await selectByLabel('SLOT 1');
await page.waitForTimeout(1600);
s = await state();
check('enters chapter 0', s.hasWorld && s.chapter === 'ch0', s.chapter);
check('chapter has geometry', s.width > 200, 'width=' + s.width);
check('chapter has checkpoints', s.checkpoints >= 1, 'n=' + s.checkpoints);
check('chapter has decoration', s.decor > 10, 'n=' + s.decor);
await shot('05-ch0-start');

// ------------------------------------------------------------------ movement
const before = await state();
await hold('ArrowRight', 900);
await page.waitForTimeout(200);
let after = await state();
check('player moves right', after.px > before.px + 40, `${before.px} -> ${after.px}`);
await shot('06-running');

// jump
await page.keyboard.down('ArrowRight');
await key('Space', 90);
await page.waitForTimeout(120);
const air = await state();
check('player leaves the ground', air.pstate === 'Airborne' || air.pstate === 'JumpStart',
      air.pstate);
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(700);
after = await state();
check('player lands again', after.grounded === true, 'state=' + after.pstate);
await shot('07-jump');

// attack
await key('KeyJ', 80);
await page.waitForTimeout(100);
const atk = await state();
check('attack state entered', /Attack/.test(atk.pstate || ''), atk.pstate);
await shot('08-attack');
await page.waitForTimeout(700);

// ------------------------------------------------------- combat resolves
// Put an enemy in reach and confirm a swing actually damages and kills it,
// rather than trusting that the state machine entered Attack1.
const combat = await page.evaluate(async () => {
  const f = window.__crownless, w = f.world;
  const { Enemy, clipsFor } = await import('./src/game/enemy.js');
  const e = new Enemy('snail', w.player.cx + 16, w.player.feetY,
                      clipsFor('snail', f.res.clips.enemies), { facing: -1 });
  w.enemies.push(e);
  const start = e.health;
  // resolve a swing directly against the world, as the player state would
  const hits = w.damageEnemies(
    { x: w.player.x, y: w.player.y - 6, w: 40, h: 28 },
    { damage: 1, knockback: 90, dirX: 1, pass: 9001, source: w.player });
  const mid = e.health;
  for (let i = 0; i < 8; i++) {
    w.damageEnemies({ x: w.player.x, y: w.player.y - 6, w: 40, h: 28 },
                    { damage: 2, knockback: 90, dirX: 1, pass: 9002 + i, heavy: true,
                      source: w.player });
  }
  return { start, mid, hits: hits.length, dead: e.dead, ash: w.player.roadAsh };
});
check('a swing damages an enemy', combat.hits > 0 && combat.mid < combat.start,
      `${combat.start} -> ${combat.mid}, hits=${combat.hits}`);
check('sustained hits kill it', combat.dead === true);
check('a kill awards road ash', combat.ash > 0, 'ash=' + combat.ash);

// ---------------------------------------------------- traverse the chapter
let far = await state();
for (let i = 0; i < 90; i++) {
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(180);
  const st = await page.evaluate(() => {
    const w = window.__crownless.world;
    if (!w) return null;
    return { x: w.player.x, g: w.player.grounded, st: w.player.state };
  });
  if (!st) break;
  // jump when blocked or at an edge
  if (st.g) { await page.keyboard.down('Space'); await page.waitForTimeout(70); await page.keyboard.up('Space'); }
  if (i % 7 === 0) { await page.keyboard.up('ArrowRight'); await key('KeyJ', 70); }
}
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(400);
const trav = await state();
check('player traverses a long distance', trav.hasWorld === false || trav.px > far.px + 300,
      `${far.px} -> ${trav.px} screen=${trav.screen}`);
await shot('09-traversal');

// ------------------------------------------------------------------- pause
if (trav.hasWorld) {
  await key('Escape');
  await page.waitForTimeout(250);
  s = await state();
  check('pause opens', s.screen === 'pause', s.screen);
  await shot('10-pause');

  // Tab cycles the pause tabs. Left/right also works, but only where the
  // focused item does not consume them (the vow slots do), so the harness
  // uses the control the footer actually advertises.
  await key('Tab');          // ROAD
  await page.waitForTimeout(200);
  await shot('11-road');
  await key('Tab');          // VOWS
  await page.waitForTimeout(200);
  await shot('12-vows');
  await key('Tab');          // JOURNAL
  await page.waitForTimeout(200);
  await shot('13-journal');
  await key('Tab');          // SETTINGS
  await page.waitForTimeout(200);
  await selectByLabel('SETTINGS');
  s = await state();
  check('settings opens from pause', s.screen === 'settings', s.screen);
  await shot('14-settings');
  await key('Backspace');
  await page.waitForTimeout(250);
  await key('Escape');
  await page.waitForTimeout(250);
}

// --------------------------------------------------- collision debug overlay
await page.evaluate(() => { if (window.__crownless.world) window.__crownless.world.debug = true; });
await page.waitForTimeout(200);
await shot('15-collision-overlay');
await page.evaluate(() => { if (window.__crownless.world) window.__crownless.world.debug = false; });

// ------------------------------------------------------ every chapter loads
const chapters = await page.evaluate(async () => {
  const f = window.__crownless;
  const mod = await import('./src/game/chapters.js');
  const out = [];
  for (const ch of mod.CHAPTERS) {
    const t0 = performance.now();
    try {
      f.save.progress.current_chapter = ch.id;
      f.save.progress.current_checkpoint_id = ch.id + '.entry';
      f.enterChapter(ch.id);
      const w = f.world;
      // count solid ground so an empty map is caught
      let solid = 0;
      for (let i = 0; i < w.map.col.length; i++) if (w.map.col[i] === 1) solid++;
      out.push({
        id: ch.id, name: ch.name, biome: ch.biome, ok: true,
        ms: Math.round(performance.now() - t0),
        width: w.c.width, solid,
        enemies: w.enemies.length, decor: w.c.decor.length,
        checkpoints: w.c.checkpoints.length, secrets: w.c.secrets,
        boss: !!w.bossEntity,
        spawnOk: w.player.y < w.map.h * 16,
      });
    } catch (e) {
      out.push({ id: ch.id, name: ch.name, ok: false, error: String(e && e.message || e) });
    }
  }
  return out;
});

let allOk = true;
for (const c of chapters) {
  if (!c.ok) { allOk = false; console.log(`   !! ${c.id} ${c.name}: ${c.error}`); continue; }
  const bad = [];
  // the epilogue is deliberately a short revisit, not a full chapter
  if (c.width < (c.id === 'chE' ? 70 : 180)) bad.push('too short');
  if (c.solid < 500) bad.push('almost no ground');
  if (c.decor < 4) bad.push('undecorated');
  if (c.checkpoints < 1) bad.push('no checkpoint');
  if (!c.spawnOk) bad.push('spawn below map');
  if (bad.length) allOk = false;
  console.log(`   ${c.ok && !bad.length ? 'ok ' : 'BAD'} ${c.id.padEnd(5)} ${c.name.padEnd(22)}`
    + ` ${String(c.biome).padEnd(12)} w=${String(c.width).padStart(4)} solid=${String(c.solid).padStart(5)}`
    + ` en=${String(c.enemies).padStart(2)} decor=${String(c.decor).padStart(3)}`
    + ` cp=${c.checkpoints} sec=${c.secrets}${c.boss ? ' BOSS' : ''}`
    + (bad.length ? '   << ' + bad.join(', ') : ''));
}
check('all 16 chapters compose', chapters.length === 16 && allOk);

// one screenshot per chapter, at the spawn
for (const c of chapters) {
  if (!c.ok) continue;
  if (ONLY && c.id !== ONLY) continue;
  await page.evaluate((id) => {
    const f = window.__crownless;
    f.save.progress.current_checkpoint_id = id + '.entry';
    f.enterChapter(id);
  }, c.id);
  await page.waitForTimeout(420);
  // walk a little so the frame is not always the same plinth
  await hold('ArrowRight', 900);
  await page.waitForTimeout(260);
  await shot('ch-' + c.id);
}

// ------------------------------------------------------------- boss phases
const boss = await page.evaluate(() => {
  const f = window.__crownless;
  f.save.progress.current_checkpoint_id = 'ch14.entry';
  f.enterChapter('ch14');
  const w = f.world;
  const b = w.bossEntity;
  if (!b) return { ok: false, why: 'no boss entity' };
  b.dormant = false;
  w.boss = b;
  const seen = [];
  for (const frac of [1.0, 0.6, 0.3]) {
    b.health = Math.ceil(b.maxHealth * frac);
    b.updateBossPhase(w);
    seen.push({ frac, phase: b.phaseIndex, tell: b.data.tell });
  }
  return { ok: true, name: b.bossDef.name, maxHealth: b.maxHealth, seen };
});
check('final boss exists with phases', boss.ok && boss.seen.length === 3,
      boss.ok ? `${boss.name} hp=${boss.maxHealth}` : boss.why);
if (boss.ok) {
  const tells = boss.seen.map((s) => s.tell);
  check('boss tells shorten as it escalates', tells[2] < tells[0], tells.join(' -> '));
}

// ------------------------------------------------- disarmed opening (ch5)
const strip = await page.evaluate(() => {
  const f = window.__crownless;
  // clear the cell waystone so the chapter opens captured
  f.save.world.restored_waystones = f.save.world.restored_waystones
    .filter((w) => w !== 'ch5.way.cell');
  f.save.progress.current_checkpoint_id = 'ch5.entry';
  f.enterChapter('ch5');
  const w = f.world;
  const before = { stripped: w.stripped, suppressed: w.player.vowsSuppressed,
                   ash: w.player.vowTier('ash') };
  const attacked = w.player.tryStartAttack(w);
  w.restoreKit();
  return { before, attacked,
           after: { stripped: w.stripped, ash: w.player.vowTier('ash') },
           saved: f.save.build.equipped_vows.slice() };
});
check('chapter 5 opens disarmed', strip.before.stripped === true
      && strip.before.ash === null);
check('attacking is refused while disarmed', strip.attacked === false);
check('the cell waystone returns the kit', strip.after.stripped === false
      && strip.after.ash !== null);
check('the strip never reaches the save file',
      strip.saved.some((v) => v !== null), JSON.stringify(strip.saved));

// ------------------------------------------------------------------- death
await page.evaluate(() => {
  const w = window.__crownless.world;
  if (!w) return;
  w.player.hurtGrace = 0;   // spawn grace would otherwise refuse the hit
  w.player.hurt(99, 1, w, 'test');
});
await page.waitForTimeout(1500);
s = await state();
check('death screen appears', s.screen === 'death', s.screen);
await shot('16-death');
await key('KeyJ');
await page.waitForTimeout(1200);
s = await state();
check('respawn returns to play', s.screen === null && s.hasWorld, s.screen);

// ------------------------------------------------------------ save / reload
await page.evaluate(() => window.__crownless.autosave());
const saved = await page.evaluate(() => {
  const raw = localStorage.getItem('crownless.slot.1');
  return raw ? JSON.parse(raw) : null;
});
check('save slot written', !!saved && saved.profile.schema_version >= 3,
      saved ? 'v' + saved.profile.schema_version : 'missing');

await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__crownless, null, { timeout: 60000 });
// the boot notice self-dismisses once it has been seen once
await page.waitForFunction(() => window.__crownless.screenName === 'title',
                           null, { timeout: 15000 }).catch(() => {});
s = await state();
check('continue is offered after reload', s.screen === 'title', s.screen);
await selectByLabel('CONTINUE');
await page.waitForTimeout(1600);
s = await state();
check('continue restores a world', s.hasWorld, 'chapter=' + s.chapter);
await shot('17-continue');

// ---------------------------------------------------------------- credits
await page.evaluate(() => window.__crownless.go('credits'));
await page.waitForTimeout(600);
await shot('18-credits');
await page.evaluate(() => window.__crownless.go('ending'));
await page.waitForTimeout(900);
await shot('19-ending');

// ------------------------------------------------------------------- report
const realErrors = errors.filter((e) => !/favicon|Autoplay|AudioContext/i.test(e));
check('no console errors', realErrors.length === 0,
      realErrors.slice(0, 5).join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (realErrors.length) {
  console.log('\nconsole errors:');
  for (const e of realErrors.slice(0, 20)) console.log('  ' + e);
}
fs.writeFileSync(path.join(OUT, 'report.json'),
                 JSON.stringify({ results, chapters, errors: realErrors }, null, 1));

await browser.close();
process.exit(failed.length ? 1 : 0);
