// Every movement and combat number the master plan specifies, as data.
// Section 12's controller-lab prompt requires these be exposed rather than
// buried in the controller, so they can be tuned without touching logic.
//
// Units: pixels and seconds. One tile is 16px.

export const TILE = 16;

export const MOVE = {
  // Section 5 target: 4.0-4.8 tiles/second
  runSpeed: 76,              // 4.75 tiles/s
  walkSpeed: 42,
  groundAccel: 620,
  groundFriction: 900,
  turnBoost: 1.7,            // faster accel when reversing, so turns feel crisp

  // apex 0.30-0.38s, height 2.75-3.25 tiles
  jumpApex: 0.34,
  jumpHeight: 49,            // 3.06 tiles
  // derived in code: v0 = 2h/t, gravity = 2h/t^2
  fallGravityMul: 1.45,      // heavier on the way down than the way up
  maxFall: 300,
  cutJumpMul: 0.42,          // variable jump height on button release

  coyoteMs: 105,             // Section 5: 90-120ms
  bufferMs: 120,             // Section 5: 100-140ms
  airControl: 0.62,          // 55-70% of ground acceleration
  airFriction: 240,

  landLockMs: 0,             // ordinary traversal stays immediate
  landHeavyMs: 95,           // 80-120ms after a heavy fall
  heavyFallSpeed: 240,       // vy above which a landing counts as heavy

  // body box; deliberately narrower than the sprite so the art can overhang
  bodyW: 10,
  bodyH: 22,
};

export const COMBAT = {
  // Section 5: normal hit-stop 40-60ms, heavy 65-90ms
  hitStopLight: 50,
  hitStopHeavy: 78,
  hitStopFinalMul: 1.15,     // final blow gets 10-20% longer hit-stop

  shakeLight: 1, shakeLightMs: 85,
  shakeHeavy: 3, shakeHeavyMs: 130,

  enemyFlashMs: 65,          // 50-80ms
  graceMs: 900,              // player invulnerability after a hit
  graceBlinkMs: 110,         // a different rhythm to the enemy flash

  attack1: {
    damage: 1,
    reach: 20, height: 18, yOffset: -11,
    knockback: 92,
    // authored per-frame timing: anticipation, active, recovery
    durations: [70, 60, 45, 45, 40, 70, 80, 90],
    activeFrom: 1, activeTo: 3,
    cancelFrom: 5,           // early cancel into movement during recovery
    hitStop: 'light',
  },
  attack2: {
    damage: 2,
    reach: 25, height: 22, yOffset: -12,
    knockback: 175,
    durations: [110, 80, 50, 50, 45, 110, 120, 140],
    activeFrom: 1, activeTo: 4,
    cancelFrom: 7,           // committed: almost no early out
    hitStop: 'heavy',
  },

  healMs: 620,               // fast enough for flow, punishable in danger
  healAmount: 2,
  knockbackDecay: 6.5,
};

export const PLAYER_ANCHOR = { x: 44, y: 66, w: 96, h: 80 };

// ------------------------------------------------------------------- vows
// Section 2: three equipped passive Vows plus one sword crest. Vows change
// numbers, timing, projectiles and feedback while preserving the same readable
// animation set -- nothing here asks for art that does not exist.
export const VOWS = {
  ash: {
    name: 'Vow of Ash', role: 'Aggression',
    blurb: 'Consecutive hits build damage and hit-stop. Taking damage clears it.',
    tiers: [
      { stacks: 3, dmgPer: 0.15, stopPer: 0.08 },
      { stacks: 4, dmgPer: 0.20, stopPer: 0.10 },
      { stacks: 5, dmgPer: 0.25, stopPer: 0.12 },
    ],
  },
  reed: {
    name: 'Vow of Reed', role: 'Movement',
    blurb: 'Late jumps gain air control. Perfect landings refill a little healing.',
    tiers: [
      { airBonus: 0.12, perfectWindow: 90, refill: 0.34 },
      { airBonus: 0.18, perfectWindow: 110, refill: 0.5 },
      { airBonus: 0.24, perfectWindow: 130, refill: 0.7 },
    ],
  },
  stone: {
    name: 'Vow of Stone', role: 'Survival',
    blurb: 'The first hit after a waystone has reduced knockback and longer grace.',
    tiers: [
      { kbMul: 0.5, graceAdd: 350 },
      { kbMul: 0.35, graceAdd: 550 },
      { kbMul: 0.2, graceAdd: 800 },
    ],
  },
  tide: {
    name: 'Vow of Tide', role: 'Recovery',
    blurb: 'Healing is slower but leaves a brief damaging pulse.',
    tiers: [
      { healMul: 1.45, pulseDamage: 1, pulseRadius: 26 },
      { healMul: 1.35, pulseDamage: 1, pulseRadius: 34 },
      { healMul: 1.25, pulseDamage: 2, pulseRadius: 40 },
    ],
  },
  bells: {
    name: 'Vow of Bells', role: 'Exploration',
    blurb: 'Nearby hidden rooms give a soft audio and UI pulse.',
    tiers: [
      { radius: 120 }, { radius: 170 }, { radius: 230 },
    ],
  },
  road: {
    name: 'Vow of the Road', role: 'Endurance',
    blurb: 'Road Ash gathered from a distance, and a little more of it.',
    tiers: [
      { magnet: 34, bonus: 0.15 }, { magnet: 48, bonus: 0.25 }, { magnet: 64, bonus: 0.4 },
    ],
  },
};

// Four crests; each changes Attack 2's property, colour and sound -- not the
// player's silhouette (Section 2).
export const CRESTS = {
  plain:  { name: 'Unmarked',    colour: '#e8e0d2', effect: null,
            blurb: 'The courier\'s own blade. Nothing added, nothing lost.' },
  ember:  { name: 'Ember Crest', colour: '#ff9a3c', effect: 'burn',
            blurb: 'Attack 2 leaves a brief burn on whatever it lands on.' },
  frost:  { name: 'Frost Crest', colour: '#8fd8ff', effect: 'slow',
            blurb: 'Attack 2 slows the struck enemy and its next telegraph.' },
  bell:   { name: 'Bell Crest',  colour: '#ffd97a', effect: 'stagger',
            blurb: 'Attack 2 staggers armoured enemies that would shrug it off.' },
};

export const DIFFICULTIES = {
  pilgrim:  { name: 'Pilgrim',  damageTaken: 0.6, grace: 350, corpseRecovery: false,
              blurb: 'For the journey. Damage reduced, grace extended.' },
  wayfarer: { name: 'Wayfarer', damageTaken: 1.0, grace: 0, corpseRecovery: false,
              blurb: 'The intended road. Keeps your Road Ash on death.' },
  courier:  { name: 'Courier',  damageTaken: 1.35, grace: -150, corpseRecovery: true,
              blurb: 'Sharper enemies, and Road Ash is dropped where you fall.' },
};
