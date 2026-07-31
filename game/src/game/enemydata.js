// Enemy data (Section 6). Every entry is asset-backed: the sprite exists in the
// collection, and no entry asks for a state the art cannot show.
//
// `tell` is the telegraph: how long the wind-up reads before the attack lands.
// Section 6 requires a visible entrance and a readable tell, and forbids an
// enemy appearing inside the camera view without one.

export const ENEMIES = {
  snail: {
    name: 'Snail', role: 'Armoured walker',
    health: 3, contactDamage: 1, speed: 12, ai: 'patrol',
    body: { w: 14, h: 12 }, drawScale: 1, ash: 3,
    armouredFrom: 'front',      // resists frontal damage while shelled
    shellMs: 1400, tell: 420,
    clips: { walk: 'walk', hide: 'hide', dead: 'dead' },
    sound: 'impact_armour',
    blurb: 'Safe spacing lesson. Cannot kill a healthy courier.',
  },
  bee: {
    name: 'Small Bee', role: 'Flying harasser',
    health: 2, contactDamage: 1, speed: 34, ai: 'flyer',
    body: { w: 12, h: 12 }, drawScale: 1, ash: 4,
    laneHeight: 30, tell: 380, diveSpeed: 120, cooldown: 1500,
    clips: { fly: 'fly', attack: 'attack', hit: 'hit', dead: 'hit' },
    sound: 'impact_flesh',
    blurb: 'Attacks down a clear lane; never spawns off-camera into a hit.',
  },
  boar: {
    name: 'Boar', role: 'Ground charger',
    health: 4, contactDamage: 1, speed: 18, ai: 'charger',
    body: { w: 16, h: 13 }, drawScale: 1, ash: 6,
    chargeSpeed: 118, tell: 620, recoverMs: 780, sightRange: 118,
    clips: { idle: 'idle', walk: 'walk', run: 'run', hit: 'hit', dead: 'hit' },
    sound: 'impact_flesh',
    blurb: 'Long telegraph, committed charge, vulnerable recovery.',
  },
  wild_boar: {
    name: 'Wild Boar', role: 'Elite charger',
    health: 9, contactDamage: 2, speed: 26, ai: 'charger',
    body: { w: 22, h: 18 }, drawScale: 1, ash: 18,
    chargeSpeed: 156, tell: 520, tellStages: 2, recoverMs: 900, sightRange: 150,
    clips: { idle: 'idle', walk: 'walk', run: 'run', attack: 'attack', dead: 'dead' },
    sound: 'impact_flesh', elite: true,
    blurb: 'Two-stage tell, higher speed. The Chapter 1 climax.',
  },
  skeleton: {
    name: 'Skeleton', role: 'Melee patrol',
    health: 5, contactDamage: 1, speed: 26, ai: 'melee',
    body: { w: 13, h: 22 }, drawScale: 1, ash: 8,
    attackRange: 26, tell: 480, recoverMs: 460, cooldown: 900, sightRange: 130,
    clips: { idle: 'idle', walk: 'walk', run: 'run', attack: 'attack', hit: 'hit', dead: 'dead' },
    sound: 'impact_armour',
    blurb: 'Readable sword attack. Never hidden behind the foreground.',
  },
  slime: {
    name: 'Small Slime', role: 'Falling ooze',
    health: 3, contactDamage: 1, speed: 20, ai: 'dropper',
    body: { w: 12, h: 11 }, drawScale: 1, ash: 4,
    dropRange: 26, tell: 300,
    clips: { idle: 'idle', move: 'move', fall: 'fall', dead: 'dead' },
    sound: 'impact_flesh',
    blurb: 'Palette variants change the surface hazard, never the silhouette.',
  },
  crab: {
    name: 'Shore Crab', role: 'Low armoured lane',
    health: 6, contactDamage: 1, speed: 22, ai: 'melee',
    body: { w: 18, h: 13 }, drawScale: 1, ash: 9,
    attackRange: 22, tell: 440, recoverMs: 520, cooldown: 1000, sightRange: 110,
    armouredFrom: 'front',
    clips: { idle: 'idle', walk: 'walk', attack: 'attack', dead: 'dead' },
    sound: 'impact_armour',
    blurb: 'Ships in the Purple Bay pack; fills the coastal role Section 6 '
         + 'lists as missing art.',
  },
  boar_warrior: {
    name: 'Boar Warrior', role: 'Armoured elite',
    health: 16, contactDamage: 2, speed: 24, ai: 'melee',
    body: { w: 22, h: 28 }, drawScale: 1, ash: 34,
    attackRange: 34, tell: 640, recoverMs: 720, cooldown: 1100, sightRange: 160,
    armouredFrom: 'front', poise: 2, elite: true,
    clips: { idle: 'idle', walk: 'walk', attack: 'attack', dead: 'dead' },
    sound: 'impact_armour',
    blurb: 'Deliberate miniboss until dedicated boss art exists.',
  },
};

// Biome recolour variants. Section 6: a recolour never silently changes damage,
// speed and health all at once -- each variant changes exactly one behaviour and
// keeps the original silhouette and timing language.
export const VARIANTS = {
  slime_toxic: { base: 'slime', tint: '#9adf5a', changes: { surfaceHazard: 'poison' },
                 note: 'leaves a poison patch; damage and speed unchanged' },
  slime_tide:  { base: 'slime', tint: '#7fc4ee', changes: { speed: 30 },
                 note: 'faster only' },
  skeleton_jailer: { base: 'skeleton', tint: '#9fc9e8', changes: { sightRange: 175 },
                 note: 'notices you sooner; nothing else changes' },
  skeleton_acolyte: { base: 'skeleton', tint: '#e08a8a', changes: { tell: 380 },
                 note: 'shorter tell only' },
  boar_pass:   { base: 'boar', tint: '#b9c4d0', changes: { chargeSpeed: 138 },
                 note: 'wind-driven charge speed only' },
  bee_swamp:   { base: 'bee', tint: '#c8e07a', changes: { cooldown: 1150 },
                 note: 'attacks more often only' },
  crab_deep:   { base: 'crab', tint: '#b090d8', changes: { health: 9 },
                 note: 'tougher only' },
};

// -------------------------------------------------------------------- bosses
// Section 6's BOSS ART GATE is explicit: do not scale a 16x16 enemy to 400% and
// call it a final boss. These five are built as *pattern* encounters on top of
// the largest asset-backed silhouettes available, at native scale, with
// arena mechanics carrying the fight. They are honest prototypes, and
// docs/asset_issues.md records that dedicated boss art is still required.
export const BOSSES = {
  gate_warden: {
    name: 'The Gate Warden', act: 1, chapter: 'ch4', arena: 'fortress',
    base: 'boar_warrior', health: 44, contactDamage: 2,
    phases: [
      { at: 1.0, tell: 640, cooldown: 1000, speed: 26, pattern: ['advance', 'cleave'] },
      { at: 0.5, tell: 520, cooldown: 800, speed: 32, pattern: ['advance', 'cleave', 'cleave'] },
    ],
    purpose: 'Armoured human-scale duel that tests spacing and Attack 2 commitment.',
  },
  saint_mire: {
    name: 'Saint of the Mire', act: 2, chapter: 'ch8', arena: 'swamp',
    base: 'crab', health: 52, contactDamage: 2, scale: 1,
    phases: [
      { at: 1.0, tell: 560, cooldown: 1100, speed: 24, pattern: ['sink', 'lunge'] },
      { at: 0.55, tell: 460, cooldown: 850, speed: 30, pattern: ['sink', 'lunge', 'spew'] },
    ],
    arenaRule: 'safeGroundShifts',
    purpose: 'The arena slowly changes safe ground; attacks forecast through water.',
  },
  bone_colossus: {
    name: 'The Bone Colossus', act: 3, chapter: 'ch11', arena: 'deadwind',
    base: 'boar_warrior', health: 66, contactDamage: 3,
    phases: [
      { at: 1.0, tell: 700, cooldown: 1200, speed: 22, pattern: ['stomp', 'sweep'] },
      { at: 0.6, tell: 600, cooldown: 950, speed: 28, pattern: ['stomp', 'sweep', 'gust'] },
      { at: 0.3, tell: 500, cooldown: 800, speed: 34, pattern: ['sweep', 'gust', 'stomp'] },
    ],
    arenaRule: 'destructibleCover',
    purpose: 'Wind-aware positioning and destructible bone cover.',
  },
  voiceless_bell: {
    name: 'The Bell Without a Voice', act: 4, chapter: 'ch13', arena: 'monastery',
    base: 'skeleton', health: 58, contactDamage: 2,
    phases: [
      { at: 1.0, tell: 620, cooldown: 1000, speed: 30, pattern: ['toll', 'rush'] },
      { at: 0.5, tell: 500, cooldown: 780, speed: 38, pattern: ['toll', 'rush', 'rush'] },
    ],
    arenaRule: 'ritualZones',
    purpose: 'Ritual pattern boss that teaches final-boss language without copying it.',
  },
  blood_regent: {
    name: 'The Blood Regent', act: 5, chapter: 'ch14', arena: 'mansion',
    base: 'boar_warrior', health: 88, contactDamage: 3,
    phases: [
      { at: 1.0, tell: 620, cooldown: 950, speed: 28, pattern: ['advance', 'cleave', 'toll'] },
      { at: 0.66, tell: 520, cooldown: 800, speed: 34, pattern: ['rush', 'sweep', 'gust'] },
      { at: 0.33, tell: 440, cooldown: 700, speed: 40, pattern: ['toll', 'rush', 'cleave', 'stomp'] },
    ],
    arenaRule: 'roadSymbols',
    purpose: 'Three short phases that remix road symbols and reward the chosen Vows.',
  },
};
