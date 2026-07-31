// SaveService: versioned schema, 3 manual slots + autosave, migration and a
// corruption fallback that never silently erases a slot (Section 11 + the
// "save safety" row of the Section 13 flow tests).

const KEY = (slot) => `crownless.slot.${slot}`;
const BACKUP = (slot) => `crownless.slot.${slot}.bak`;
export const SCHEMA_VERSION = 3;
export const SLOTS = [1, 2, 3];
export const AUTOSAVE_SLOT = 0;   // slot 0 is the autosave

export function blankSave(slot, difficulty = 'wayfarer') {
  const now = Date.now();
  return {
    profile: {
      schema_version: SCHEMA_VERSION, slot_id: slot, play_time: 0,
      difficulty, created_at: now, updated_at: now,
    },
    progress: {
      // the chapter entry, not a waystone: a new game must start at the
      // chapter's own spawn plinth, not halfway along its road
      current_chapter: 'ch0', current_checkpoint_id: 'ch0.entry',
      completed_chapters: [], endings: [],
    },
    player: { max_health: 5, current_health: 5, healing_count: 2, road_ash: 0 },
    build: {
      equipped_vows: ['ash', null, null], vow_levels: { ash: 1 },
      sword_crest: 'plain', unlocked_relics: [],
    },
    world: {
      collected_fragment_ids: [], opened_chests: [], restored_waystones: [],
      chapter_secret_flags: {}, tutorial_steps: [],
    },
    stats: { deaths: 0, enemies_felled: 0, secrets_found: 0 },
  };
}

// ------------------------------------------------------------------ migration
const MIGRATIONS = {
  // 1 -> 2: stats block added
  1: (s) => { s.stats = s.stats || { deaths: 0, enemies_felled: 0, secrets_found: 0 }; return s; },
  // 2 -> 3: tutorial step tracking moved into world so it survives a reload
  2: (s) => { s.world.tutorial_steps = s.world.tutorial_steps || []; return s; },
};

function migrate(save) {
  let v = save.profile?.schema_version ?? 1;
  while (v < SCHEMA_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error('no migration path from schema ' + v);
    save = m(save);
    v++;
    save.profile.schema_version = v;
  }
  return save;
}

function validate(s) {
  return !!(s && s.profile && s.progress && s.player && s.build && s.world
            && typeof s.progress.current_chapter === 'string');
}

// ----------------------------------------------------------------- read/write
export function readSlot(slot) {
  for (const key of [KEY(slot), BACKUP(slot)]) {
    let raw;
    try { raw = localStorage.getItem(key); } catch { return { state: 'unavailable' }; }
    if (!raw) continue;
    try {
      let s = JSON.parse(raw);
      if (!validate(s)) throw new Error('shape');
      s = migrate(s);
      return { state: key === KEY(slot) ? 'ok' : 'recovered', save: s };
    } catch (e) {
      // fall through to the backup rather than deleting anything
      continue;
    }
  }
  try {
    if (localStorage.getItem(KEY(slot)) !== null) {
      // present but unreadable and no usable backup: report, never wipe
      return { state: 'corrupt' };
    }
  } catch { /* ignore */ }
  return { state: 'empty' };
}

export function writeSlot(slot, save) {
  save.profile.slot_id = slot;
  save.profile.updated_at = Date.now();
  save.profile.schema_version = SCHEMA_VERSION;
  const json = JSON.stringify(save);
  try {
    // keep the previous good copy as a backup before overwriting
    const prev = localStorage.getItem(KEY(slot));
    if (prev) localStorage.setItem(BACKUP(slot), prev);
    localStorage.setItem(KEY(slot), json);
    return true;
  } catch (e) {
    return false;
  }
}

export function deleteSlot(slot) {
  try {
    localStorage.removeItem(KEY(slot));
    localStorage.removeItem(BACKUP(slot));
    return true;
  } catch { return false; }
}

export function slotSummary(slot) {
  const r = readSlot(slot);
  if (r.state !== 'ok' && r.state !== 'recovered') return { slot, state: r.state };
  const s = r.save;
  return {
    slot, state: r.state,
    chapter: s.progress.current_chapter,
    completed: s.progress.completed_chapters.length,
    play_time: s.profile.play_time,
    health: s.player.current_health,
    max_health: s.player.max_health,
    checkpoint: s.progress.current_checkpoint_id,
    difficulty: s.profile.difficulty,
    updated_at: s.profile.updated_at,
  };
}

export function formatTime(ms) {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Most recently updated non-empty slot, for Continue. */
export function mostRecentSlot() {
  let best = null;
  for (const slot of [AUTOSAVE_SLOT, ...SLOTS]) {
    const sum = slotSummary(slot);
    if (sum.state !== 'ok' && sum.state !== 'recovered') continue;
    if (!best || sum.updated_at > best.updated_at) best = sum;
  }
  return best;
}
