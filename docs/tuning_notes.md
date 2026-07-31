# Tuning notes

Findings from actually building and measuring the thing, recorded where they
differ from the master plan or from what the plan assumed.

## The Section 7 maximum gap cannot be reached by the Section 5 movement targets

Section 7's platform-metric table gives a "maximum base gap" of 4.5–5.5 tiles.
That figure is not achievable by the movement targets printed two sections
earlier, and the two tables sit about a page apart.

Working it through with the Section 5 numbers:

| | |
|---|---|
| run speed | 4.0–4.8 tiles/s → 64–77 px/s |
| time to apex | 0.30–0.38 s |
| jump height | 2.75–3.25 tiles → 44–52 px |

With the values the game ships (76 px/s, 0.34 s apex, 49 px height, and a 1.45×
fall multiplier so the descent is heavier than the rise):

```
rise      = 0.34 s
fall      = sqrt(2 · 49 / (830 · 1.45)) = 0.29 s
air time  = 0.63 s
distance  = 76 · 0.63 = 47 px = 2.9 tiles
```

A 4.5-tile gap is 72 px. Clearing it would need roughly 0.95 s of air time —
half again what these numbers give — or a run speed near 115 px/s, well outside
the stated range.

Section 7 also says, in the same row: *"Confirm only after controller tuning; do
not build to theoretical maximum."* So the composer derives its limit from the
tuned controller instead of the printed number. `compose.js` computes
`REACH_PX` from the live `MOVE` constants and sets `MAX_GAP` to
`floor(REACH_PX / 16) - 0.55` tiles, which currently yields **2 tiles** for an
ordinary gap with a guaranteed landing of at least 3 tiles beyond it.

If the movement feel is later retuned upward, the gaps widen automatically —
the constant is derived, not typed in. Nothing needs to be re-authored.

## Camera framing

Section 8 specifies look-ahead of 1.5–2.5 tiles and a small horizontal dead
zone, but says nothing about where the standing surface should sit vertically.
First pass put it at 58% down the frame, which left the subsurface fill taking
just over half the screen. It now sits at 68%, which keeps the sky and the
biome's landmarks in view. This matters more than it sounds: the packs put most
of their identity in the background layers and the tall props, and burying them
under dirt throws away the thing that makes fifteen environments feel different.

## Subsurface fill

Autotiling the full depth of the ground with the tileset's varied body tiles
turns the underground into repeating noise that competes with the gameplay
plane. Variation is now limited to the top two rows below the surface; anything
deeper uses a single plain tile. This is the Section 8 rule — *"gameplay plane
keeps the strongest local contrast"* — applied downward rather than into the
distance.

## Atmospheric veil

Some packs ship bright or busy backgrounds (Lonely Mine especially, whose
background is a large high-contrast image). Drawn at full strength they swallow
the player's silhouette. Each chapter now carries a `haze` value that composites
its sky colour over the parallax layers before the gameplay plane draws. This is
Section 8's *"far layers move toward a shared atmospheric colour"*, and it is
what keeps Chapter 9 readable.

## Interior ceilings must follow the floor

A ceiling at a fixed row above a floor that rises and falls is simply never in
frame, and an interior chapter ends up reading as a dungeon tileset under an
open black sky. `capCeiling` tracks each column's surface and keeps 8–13 tiles
of headroom, varying slowly.

## Enemy telegraph windows

Section 6 asks for readable tells but gives no numbers. The values in
`enemydata.js` were chosen against the movement envelope above: a tell has to be
long enough for a player at full run to stop and reverse, which at 76 px/s and
620 px/s² of ground friction is about 120 ms of braking plus reaction. Tells run
380–700 ms, with the elite chargers at the long end because their committed
charge is unanswerable once it starts.

## Hit-stop and the UI

Section 5 says hit-stop must never freeze UI animations. The implementation
freezes gameplay by zeroing `dt` for the world only; screen effects, HUD fades
and menu transitions run off `performance.now()` and are unaffected.

## What the harness caught that review did not

Recorded because it is the argument for the harness existing at all:

1. A missing `assets/` prefix on tileset paths threw on the first draw. Because
   the throw was inside `requestAnimationFrame`, the loop stopped rescheduling
   and the game froze with no visible error — it looked exactly like an input
   bug. The loop now survives a bad frame.
2. A new game began at a mid-chapter waystone rather than the chapter spawn,
   because the blank save's default checkpoint id pointed at a real waystone.
3. Decoration placement scanned top-down for the ground and found the *ceiling*
   in enclosed biomes, so seven chapters shipped completely undressed while
   still reporting success.
4. The boss-placement block sat below an early `return` that fired on exactly
   the beat type it was meant to handle, so every boss chapter had no boss.
5. Chapter 5's disarming cleared the player's vow array, which the next autosave
   wrote straight to disk — a permanent loss of progression from a temporary
   story beat. Vows are now suppressed behind a flag instead.
