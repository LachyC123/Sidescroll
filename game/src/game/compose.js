// Level composition.
//
// Section 7 gives a room grammar, a platform-metric table and an explicit list
// of "rules that stop the levels looking AI-made". This composer is written to
// those rules: it greyboxes collision first, authors terrain from a small
// vocabulary of fair features, then dresses it with *composed* prop clusters,
// landmarks and deliberate negative space rather than an even scatter.
//
// Composition is seeded per chapter, so a chapter is identical on every machine
// and every replay. It is authored-by-seed, not re-rolled at runtime.

import { RNG } from '../core/rng.js';
import { TileMap, TS, AIR, SOLID, PLATFORM, HAZARD, WATER } from '../render/tilemap.js';
import { MOVE } from './tuning.js';

// ---------------------------------------------------------------------------
// Reachability, derived from the tuned controller rather than assumed.
//
// Section 7's table suggests a 4.5-5.5 tile maximum gap, but that number cannot
// be reached by the Section 5 movement targets it sits beside: at 76 px/s with a
// 0.34s apex and a 49px jump height, total air time is ~0.62s, which carries the
// player about 47px -- under three tiles. Section 7 also says to confirm the
// maximum only after controller tuning and never to build to the theoretical
// figure, so the composer uses the measured envelope. This is recorded in
// docs/tuning_notes.md.
const AIR_TIME = MOVE.jumpApex + Math.sqrt(2 * MOVE.jumpHeight
                 / ((2 * MOVE.jumpHeight / (MOVE.jumpApex * MOVE.jumpApex)) * MOVE.fallGravityMul));
export const REACH_PX = MOVE.runSpeed * AIR_TIME;
export const MAX_GAP = Math.max(2, Math.floor((REACH_PX / TS) - 0.55));   // tiles
export const MAX_RISE = Math.floor(MOVE.jumpHeight / TS);                 // tiles

const SAFE_LANDING = 2;      // Section 7: at least 2 tiles wide
const HEAD_CLEAR = 3;        // player frame + 1 tile

export class Composed {
  constructor() {
    this.map = null;
    this.decor = [];         // {sheet,sx,sy,sw,sh,x,y,layer}
    this.entities = [];      // {type,...}
    this.checkpoints = [];
    this.rooms = [];         // {x0,x1,type,teach}
    this.spawn = { x: 0, y: 0 };
    this.exit = { x: 0, y: 0 };
    this.horizonY = 0;
    this.secrets = 0;
  }
}

/**
 * @param ch        chapter spec from chapters.js
 * @param tilesets  data/tilesets.json
 * @param props     data/props.json
 */
export function composeChapter(ch, tilesets, props) {
  const rng = new RNG(ch.seed);
  const ts = tilesets[ch.biome];
  const pr = props[ch.biome] || { all: [], landmark: [], standing: [], hanging: [] };

  const totalW = ch.beats.reduce((a, b) => a + b.len, 0) + 8;
  const H = ch.vertical ? 96 : 40;
  const out = new Composed();
  const map = new TileMap(totalW, H, ts);
  out.map = map;

  // Two or three recurring shapes per chapter, so the player remembers the
  // place (Section 7). Chosen once, up front, from the seed.
  const motifs = pickMotifs(rng, pr);

  const base = ch.vertical ? 14 : H - 13;
  let gy = base;               // current ground row
  let x = 4;

  // opening plinth so the player never spawns on an edge
  carveFlat(map, 0, x + 6, gy, H);
  out.spawn = { x: (x + 2) * TS, y: gy * TS - 4 };

  for (let bi = 0; bi < ch.beats.length; bi++) {
    const beat = ch.beats[bi];
    const x0 = x;
    const room = { x0, x1: x0 + beat.len, type: beat.type, teach: beat.teach,
                   index: bi, gy };
    const r = buildBeat(map, out, ch, beat, rng, x, gy, H, pr, motifs, bi);
    x = r.x;
    gy = r.gy;
    room.x1 = x;
    room.gyEnd = gy;
    out.rooms.push(room);
  }

  // closing plinth + exit
  carveFlat(map, x, x + 6, gy, H);
  out.exit = { x: (x + 3) * TS, y: gy * TS - 4 };
  x += 6;

  // trim to the used width
  out.width = Math.min(totalW, x + 2);
  out.horizonY = base * TS;

  // ceiling for enclosed biomes, so parallax never shows through the roof
  if (isInterior(ch)) capCeiling(map, out.width, H, base, rng, ch);

  map.autotile(rng);
  dressRooms(out, ch, rng, pr, motifs);
  return out;
}

function isInterior(ch) {
  return ['prison', 'sewers', 'deep_cave', 'mine', 'temple', 'monastery', 'mansion']
    .includes(ch.biome);
}

function pickMotifs(rng, pr) {
  // Packs vary enormously in how much loose decoration they ship: High Forest
  // yields hundreds of objects, Muddy Swamp and Scarlet Monastery a handful.
  // Fall through the size bands so every biome still gets composed dressing
  // rather than silently ending up bare.
  const standing = pr.standing.length ? pr.standing : pr.all.filter((o) => o.kind !== 'hanging');
  const byBand = (b) => standing.filter((o) => o.band === b);
  const large = pr.landmark.length ? pr.landmark : byBand('large');
  const mid = byBand('medium');
  const small = byBand('small');

  const repeatPool = mid.length ? mid : small.length ? small : standing;
  const smallPool = small.length ? small : mid.length ? mid : standing;

  return {
    landmark: large.length ? rng.pick(large) : (standing.length ? rng.pick(standing) : null),
    // two or three repeated shapes carry the chapter's identity
    repeat: rng.shuffle(repeatPool).slice(0, 3),
    small: rng.shuffle(smallPool).slice(0, 6),
    hanging: pr.hanging.length ? rng.shuffle(pr.hanging).slice(0, 3) : [],
  };
}

// ---------------------------------------------------------------------- terrain
function carveFlat(map, x0, x1, gy, H) {
  for (let x = x0; x < x1; x++) {
    for (let y = gy; y < H; y++) map.set(x, y, SOLID);
  }
}

function carvePlatform(map, x0, len, y) {
  for (let x = x0; x < x0 + len; x++) map.set(x, y, PLATFORM);
}

function fillHazard(map, x0, x1, y, H, kind) {
  const v = kind === 'water' ? WATER : HAZARD;
  for (let x = x0; x < x1; x++) {
    map.set(x, y, v);
    if (kind === 'water') for (let yy = y + 1; yy < Math.min(H, y + 3); yy++) map.set(x, yy, WATER);
  }
}

/**
 * Build one beat of the pacing template. Each type has its own grammar:
 * arrival reveals safely, teach isolates one idea, test combines it with known
 * terrain, rest is guaranteed calm, twist inverts a rule, climax is a composed
 * arena and departure hands control back quickly.
 */
function buildBeat(map, out, ch, beat, rng, x, gy, H, pr, motifs, bi) {
  const end = x + beat.len;
  const hazardKind = ch.hazard;
  let lastFeature = null;

  const safeOnly = beat.safe || beat.type === 'arrival' || beat.type === 'rest'
                   || beat.type === 'departure';

  while (x < end) {
    const left = end - x;

    if (beat.type === 'rest' || beat.type === 'departure' || safeOnly) {
      // Rest rooms have no hidden ambush and no traversal question at all.
      const n = Math.min(left, rng.int(6, 10));
      carveFlat(map, x, x + n, gy, H);
      x += n;
      if (left - n > 4 && rng.chance(0.35)) {
        const d = rng.chance(0.5) ? 1 : -1;
        gy = clampGy(gy + d, ch, H);
      }
      lastFeature = 'flat';
      continue;
    }

    if (beat.type === 'climax' || beat.type === 'boss') {
      // One composed arena: a wide, clean floor with clear camera bounds and
      // enough room for every tell in the encounter to read.
      const n = left;
      carveFlat(map, x, x + n, gy, H);
      // optional advantage platforms, never clutter
      if (n > 22 && beat.type !== 'boss') {
        carvePlatform(map, x + 6, 4, gy - 4);
        carvePlatform(map, x + n - 10, 4, gy - 4);
      }
      x += n;
      lastFeature = 'arena';
      continue;
    }

    // ---- traversal vocabulary
    const choices = [];
    choices.push({ w: 4, f: 'flat' });
    if (lastFeature !== 'gap' && left > MAX_GAP + SAFE_LANDING + 3) {
      choices.push({ w: beat.type === 'test' || beat.type === 'twist' ? 3 : 2, f: 'gap' });
    }
    if (left > 8) choices.push({ w: 2, f: 'step' });
    if (left > 12) choices.push({ w: 2, f: 'ledge' });
    if (left > 14 && (beat.type === 'twist' || beat.type === 'test')) {
      choices.push({ w: 2, f: 'terrace' });
    }
    if (left > 12 && hazardKind && beat.type !== 'teach') {
      choices.push({ w: 2, f: 'hazard' });
    }
    if (beat.teach === 'jump' && left > 10) choices.push({ w: 6, f: 'gap' });
    if (beat.teach === 'hazard' && left > 12 && hazardKind) choices.push({ w: 6, f: 'hazard' });

    const f = weightedPick(rng, choices);

    switch (f) {
      case 'flat': {
        const n = Math.min(left, rng.int(4, 8));
        carveFlat(map, x, x + n, gy, H);
        x += n;
        break;
      }
      case 'step': {
        const n = Math.min(left, rng.int(3, 6));
        carveFlat(map, x, x + n, gy, H);
        x += n;
        const d = rng.chance(0.5) ? 1 : -1;
        gy = clampGy(gy + d, ch, H);   // one tile: never interrupts run flow
        break;
      }
      case 'gap': {
        // committed jump, always with a readable landing on the far side
        const g = rng.int(2, MAX_GAP);
        const landing = Math.max(SAFE_LANDING + 1, rng.int(3, 5));
        if (g + landing + 1 > left) { carveFlat(map, x, end, gy, H); x = end; break; }
        x += g;
        // Section 7: a blind drop is never lethal on first contact. Floor the
        // pit shallowly so it reads as a dip in the road with a visible bottom,
        // rather than a narrow slot the player cannot see into.
        const floorAt = gy + 3;
        if (hazardKind === 'water' || hazardKind === 'poison') {
          fillHazard(map, x - g, x, floorAt - 1, H, hazardKind === 'water' ? 'water' : 'poison');
        }
        for (let xx = x - g; xx < x; xx++) {
          for (let yy = floorAt; yy < H; yy++) map.set(xx, yy, SOLID);
        }
        carveFlat(map, x, x + landing, gy, H);
        x += landing;
        break;
      }
      case 'ledge': {
        const n = Math.min(left, rng.int(6, 10));
        carveFlat(map, x, x + n, gy, H);
        // a reachable one-way platform, and a reason to be up there
        const py = gy - rng.int(3, MAX_RISE);
        const plen = rng.int(3, 5);
        const px = x + rng.int(1, Math.max(1, n - plen - 1));
        carvePlatform(map, px, plen, py);
        if (rng.chance(0.55)) {
          out.entities.push({ type: 'ash', x: (px + plen / 2) * TS, y: py * TS - 8,
                              amount: rng.int(3, 7) });
        }
        x += n;
        break;
      }
      case 'terrace': {
        const n = Math.min(left, rng.int(7, 11));
        const rise = rng.int(2, MAX_RISE);
        carveFlat(map, x, x + 3, gy, H);
        carvePlatform(map, x + 3, 3, gy - Math.ceil(rise / 2));
        gy = clampGy(gy - rise, ch, H);
        carveFlat(map, x + 5, x + n, gy, H);
        x += n;
        break;
      }
      case 'hazard': {
        const n = Math.min(left, rng.int(6, 10));
        carveFlat(map, x, x + n, gy, H);
        const hx = x + rng.int(1, 3);
        const hlen = rng.int(2, 3);
        for (let xx = hx; xx < Math.min(hx + hlen, x + n - 1); xx++) {
          map.set(xx, gy, hazardKind === 'water' ? WATER : HAZARD);
        }
        // always an answer: a platform over it, or room to jump
        if (rng.chance(0.5)) carvePlatform(map, hx, hlen, gy - 3);
        x += n;
        break;
      }
      default: {
        const n = Math.min(left, 5);
        carveFlat(map, x, x + n, gy, H);
        x += n;
      }
    }
    lastFeature = f;
  }

  // ---- gameplay objects, placed after the greybox exists (Section 7 step 6)
  placeBeatObjects(map, out, ch, beat, rng, { x0: end - beat.len, x1: x, gy }, H, bi);
  return { x, gy };
}

function clampGy(gy, ch, H) {
  const lo = ch.vertical ? 8 : 10;
  const hi = H - 6;
  return Math.max(lo, Math.min(hi, gy));
}

function weightedPick(rng, choices) {
  const total = choices.reduce((a, c) => a + c.w, 0);
  let r = rng.next() * total;
  for (const c of choices) { r -= c.w; if (r <= 0) return c.f; }
  return choices[choices.length - 1].f;
}

/**
 * Find the walkable surface at a column.
 *
 * Interior biomes get a solid ceiling mass filled from row 0, so a naive
 * top-down scan returns the *roof*. Skip any solid block that starts at the
 * very top, then take the first surface below it.
 */
function groundRowAt(map, x, H) {
  let y = 0;
  while (y < H && map.get(x, y) === SOLID) y++;    // step past a ceiling
  for (; y < H; y++) {
    const v = map.get(x, y);
    if (v === SOLID || v === PLATFORM) return y;
  }
  return -1;
}

function placeBeatObjects(map, out, ch, beat, rng, span, H, bi) {
  const { x0, x1 } = span;
  const mid = Math.floor((x0 + x1) / 2);

  if (beat.waystone) {
    const gr = groundRowAt(map, mid, H);
    if (gr > 0) {
      const id = `${ch.id}.way.${beat.waystone}`;
      out.checkpoints.push({ id, x: mid * TS + 8, y: gr * TS, key: beat.waystone,
                             restore: !!beat.restore });
      out.entities.push({ type: 'waystone', id, x: mid * TS + 8, y: gr * TS });
    }
  }

  // a worthwhile side route per chapter, clued from the main path
  if (beat.side) {
    const sx = x0 + Math.floor((x1 - x0) * 0.55);
    const gr = groundRowAt(map, sx, H);
    if (gr > 4) {
      const roomY = gr - 7;
      for (let xx = sx; xx < sx + 7; xx++) {
        for (let yy = roomY; yy < roomY + 4; yy++) map.set(xx, yy, AIR);
        map.set(xx, roomY + 4, SOLID);
      }
      carvePlatform(map, sx - 2, 3, gr - 3);
      carvePlatform(map, sx, 3, roomY + 4);
      const reward = bi % 3 === 0 ? 'fragment' : 'ash';
      out.entities.push(reward === 'fragment'
        ? { type: 'fragment', id: `${ch.id}.frag.${bi}`, x: (sx + 3) * TS, y: (roomY + 3) * TS }
        : { type: 'ash', x: (sx + 3) * TS, y: (roomY + 3) * TS, amount: rng.int(12, 22) });
      out.entities.push({ type: 'secret', id: `${ch.id}.secret.${bi}`,
                          x: (sx + 3) * TS, y: (roomY + 2) * TS });
      out.secrets++;
    }
  }

  // The boss is placed before the ordinary-enemy guard below, which returns
  // early on a boss beat -- otherwise this block is unreachable and boss
  // chapters ship with no boss at all.
  if (beat.type === 'boss' && ch.boss) {
    const bx = Math.floor((x0 + x1) / 2) + 6;
    const gr = groundRowAt(map, bx, H);
    if (gr > 0) {
      out.entities.push({ type: 'boss', boss: ch.boss, x: bx * TS, y: gr * TS,
                          x0: x0 * TS, x1: x1 * TS });
    }
  }

  // enemies: authored positions, on ground, with room for their tell
  const roster = beat.enemy ? [beat.enemy] : (ch.enemies || []);
  if (!roster.length || beat.type === 'rest' || beat.type === 'arrival'
      || beat.type === 'departure' || beat.type === 'boss' || beat.safe) return;

  let count = 0;
  if (beat.type === 'teach') count = 1;
  else if (beat.type === 'test') count = rng.int(2, 3);
  else if (beat.type === 'twist') count = rng.int(2, 3);
  else if (beat.type === 'climax') count = 0;   // the climax spawns its own set

  const placed = [];
  for (let i = 0; i < count; i++) {
    // Section 6: at most three enemy roles on screen at once, and a spawn must
    // have at least three tiles of clear approach so its tell is visible.
    for (let tries = 0; tries < 24; tries++) {
      const ex = rng.int(x0 + 6, Math.max(x0 + 7, x1 - 6));
      if (placed.some((p) => Math.abs(p - ex) < 9)) continue;
      const gr = groundRowAt(map, ex, H);
      if (gr < 2) continue;
      if (map.get(ex, gr) !== SOLID) continue;
      // needs flat ground either side for the approach to read
      let flat = true;
      for (let d = -3; d <= 3; d++) if (groundRowAt(map, ex + d, H) !== gr) { flat = false; break; }
      if (!flat) continue;
      const kind = beat.enemy || rng.pick(roster);
      out.entities.push({
        type: 'enemy', kind, x: ex * TS + 8, y: gr * TS,
        patrolFrom: (ex - 4) * TS, patrolTo: (ex + 4) * TS,
        facing: rng.chance(0.5) ? 1 : -1,
      });
      placed.push(ex);
      break;
    }
  }

  // climax roster
  if (beat.type === 'climax' && ch.climax) {
    const cx = Math.floor((x0 + x1) / 2);
    const gr = groundRowAt(map, cx, H);
    if (gr > 0) {
      if (ch.climax.kind === 'elite') {
        out.entities.push({ type: 'enemy', kind: ch.climax.enemy, elite: true,
                            x: (cx + 6) * TS, y: gr * TS,
                            patrolFrom: (x0 + 3) * TS, patrolTo: (x1 - 3) * TS, facing: -1 });
        out.entities.push({ type: 'arena', x0: x0 * TS, x1: x1 * TS, name: ch.climax.name });
      } else if (ch.climax.enemies) {
        ch.climax.enemies.forEach((k, i) => {
          const ex = cx + (i - 1) * 7;
          const g2 = groundRowAt(map, ex, H);
          if (g2 > 0) {
            out.entities.push({ type: 'enemy', kind: k, x: ex * TS + 8, y: g2 * TS,
                                patrolFrom: (x0 + 3) * TS, patrolTo: (x1 - 3) * TS,
                                facing: i % 2 ? 1 : -1 });
          }
        });
        out.entities.push({ type: 'arena', x0: x0 * TS, x1: x1 * TS, name: 'Standing Ground' });
      }
    }
  }

}

/**
 * Roof an enclosed biome.
 *
 * The ceiling has to follow the floor, not sit at a fixed row: a flat roof high
 * above a rising floor is simply never in frame, and the chapter reads as an
 * interior tileset under an open black sky. Headroom varies slowly so the
 * corridor breathes, and never drops below the player's frame plus a tile.
 */
function capCeiling(map, w, H, base, rng, ch) {
  let head = rng.int(8, 11);
  for (let x = 0; x < w; x++) {
    if (x % 6 === 0) head = Math.max(HEAD_CLEAR + 3, Math.min(13, head + rng.int(-1, 1)));
    // find this column's walkable surface, ignoring anything already roofed
    let surface = -1;
    for (let y = 0; y < H; y++) {
      const v = map.get(x, y);
      if (v === SOLID || v === PLATFORM) { surface = y; break; }
    }
    if (surface < 0) surface = base;
    const cy = Math.max(0, surface - head);
    for (let y = 0; y <= cy; y++) map.set(x, y, SOLID);
  }
}

// ------------------------------------------------------------------- dressing
/**
 * Decoration pass. Section 7's anti-slop rules, applied literally:
 *  - do not distribute props evenly; compose clusters, landmarks, negative space
 *  - do not use every object in every room; restrict the palette per room
 *  - each repeated object needs a world reason
 *  - large decoration may overlap the grid visually; collision stays simple
 */
function dressRooms(out, ch, rng, pr, motifs) {
  const map = out.map;
  const H = map.h;

  for (const room of out.rooms) {
    // restricted palette: each room draws from a small subset, not the whole sheet
    const palette = {
      repeat: rng.shuffle(motifs.repeat).slice(0, 2),
      small: rng.shuffle(motifs.small).slice(0, 3),
    };
    const width = room.x1 - room.x0;
    if (width < 6) continue;

    // one landmark per room, and only where it means something: the entrance of
    // an arrival, the far wall of a climax, beside a waystone in a rest room
    if (motifs.landmark && ['arrival', 'rest', 'climax', 'boss'].includes(room.type)) {
      const lx = room.type === 'arrival' ? room.x0 + 3
               : room.type === 'rest' ? Math.floor((room.x0 + room.x1) / 2) + 4
               : room.x1 - 8;
      placeStanding(out, map, motifs.landmark, lx, H, 'mid');
    }

    // clusters, with deliberate empty stretches between them
    const clusters = Math.max(1, Math.floor(width / 16));
    let cursor = room.x0 + 2;
    for (let c = 0; c < clusters; c++) {
      const span = Math.floor(width / clusters);
      const anchor = cursor + rng.int(1, Math.max(2, span - 6));
      const n = rng.int(2, 4);
      let lastObj = null;
      for (let i = 0; i < n; i++) {
        const pool = i === 0 ? palette.repeat : palette.small;
        if (!pool.length) continue;
        const obj = rng.pickNot(pool, lastObj);
        lastObj = obj;
        const ox = anchor + rng.int(-3, 3);
        placeStanding(out, map, obj, ox, H, 'mid');
      }
      cursor += span;
      // negative space: the rest of the span stays empty on purpose
    }

    // hanging dressing only under a real ceiling
    if (motifs.hanging.length && isInterior(ch)) {
      const n = Math.max(1, Math.floor(width / 22));
      for (let i = 0; i < n; i++) {
        const hx = room.x0 + rng.int(2, Math.max(3, width - 3));
        const obj = rng.pick(motifs.hanging);
        placeHanging(out, map, obj, hx, H);
      }
    }
  }
}

function placeStanding(out, map, obj, tx, H, layer) {
  if (!obj || tx < 1 || tx >= map.w - 1) return;
  const gr = groundRowAt(map, tx, H);
  if (gr < 1) return;
  // do not stand a prop on a one-way platform or in a hazard
  if (map.get(tx, gr) !== SOLID) return;
  const px = tx * TS + (TS - obj.w) / 2;
  const py = gr * TS - obj.h;
  out.decor.push({ sheet: obj.sheet, sx: obj.x, sy: obj.y, sw: obj.w, sh: obj.h,
                   x: Math.round(px), y: Math.round(py), layer: layer || 'mid' });
}

function placeHanging(out, map, obj, tx, H) {
  if (!obj || tx < 1 || tx >= map.w - 1) return;
  // find the ceiling above the walkable surface
  const gr = groundRowAt(map, tx, H);
  if (gr < 3) return;
  let cy = -1;
  for (let y = gr - 1; y >= 0; y--) if (map.get(tx, y) === SOLID) { cy = y; break; }
  if (cy < 0 || gr - cy < 4) return;
  const px = tx * TS + (TS - obj.w) / 2;
  const py = (cy + 1) * TS;
  out.decor.push({ sheet: obj.sheet, sx: obj.x, sy: obj.y, sw: obj.w, sh: obj.h,
                   x: Math.round(px), y: Math.round(py), layer: 'mid' });
}
