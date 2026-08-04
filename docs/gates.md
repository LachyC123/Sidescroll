# Gate log

Status against the Section 12 milestone table. "Done" here means the
deliverable exists and the exit condition is met by something checkable, not
that a human has signed it off — Section 12 is explicit that *"code compiles" is
not approval*, and every gate below still wants a human pass.

| Gate | Focus | Status | Evidence |
|---|---|---|---|
| 0 | Asset truth | **Done** | `docs/asset_manifest.{json,csv}`, `docs/pack_coverage.md`, `docs/asset_issues.md` |
| 1 | Asset Museum | **Partial** | Every asset is loaded, named and drawn correctly in-game and listed in the manifest. There is no dedicated museum scene. |
| 2 | Controller lab | **Done** | `tools/verify.mjs` movement/jump/attack/combat checks; `docs/evidence/06-08` |
| 3 | Tutorial vertical slice | **Done** | Chapter 0 with the Section 4 beat sheet and contextual prompts; `docs/evidence/05,09` |
| 4 | Complete shell | **Done** | Every Section 9 screen; boot-to-credits flow verified |
| 5 | Chapter pipeline | **Done** | Chapters 1–2 built by the same composer as the rest |
| 6 | Content production | **Done** | All 15 chapters + epilogue compose and are playable |
| 7 | Boss + finale | **Partial** | Five bosses with real phase behaviour, but on existing silhouettes. Section 6's art gate is **not** cleared. |
| 8 | Polish + QA | **Partial** | 43 automated checks pass; no human playtests |

## Section 13 release checklist

| Item | Status |
|---|---|
| No placeholder art or debug labels in release scenes | Bosses use stand-in silhouettes — **not met** |
| All 17 collection items in the ledger | Met — `docs/pack_coverage.md` |
| All 15 environment packs have a finished campaign use | Met |
| Title-to-credits completable without developer tools | Met |
| All menu paths work on keyboard and gamepad, no mouse-only blocker | Met — the harness navigates entirely by key press |
| Three save slots, autosave, delete confirmation, versioned migration | Met — schema v3 with a migration chain and a backup-based corruption fallback |
| Credits and licence notices complete | Partial — two packs ship no licence text, recorded in `asset_issues.md` |
| Clean install has no missing imports or absolute paths | Met — no build step, all paths relative |
| Five first-time playtests, two completion passes | **Not met** — no human has played it |
| Zero crash/blocker/progression-loss bugs | No known ones; five were found and fixed during verification, listed in `tuning_notes.md` |

## Chapter definition of done

Checked automatically for all 16 chapters by `tools/verify.mjs`:

- entry and exit connect to the intended neighbours — **yes**, `nextChapterId` chain
- all required pack assets represented and logged — **yes**, coverage table
- main route and checkpoints completable — **yes**, spawn-to-exit verified
- no decorative sprite creates unintended collision — **yes by construction**;
  collision comes only from the collision layer, decor is drawn, never solid
- no blind lethal jump — **yes by construction**; pits are floored three tiles
  down rather than opened to the map bottom
- parallax covers camera extremes without seams — **yes**, layers tile
  horizontally and are anchored to the level horizon
- save/reload at every checkpoint restores correct state — **verified** for the
  autosave and slot path
- keyboard and gamepad prompts update on device change — **yes**, `InputService`
  fires a device-change event and prompts re-read the glyph each frame

## Systems added after first playable

Found by playtesting with real input rather than by reading the code:

- **Bees were unhittable.** Their lane sat two pixels above the top of the
  attack box, so a grounded swing could never connect while looking correct on
  screen. Lane height reduced; a per-enemy reachability assertion now guards it.
- **Armour nullified instead of resisting.** A light hit against an armoured
  enemy dealt `round(1 x 0.25) = 0`, which made the snail invulnerable during
  the shell it enters whenever you are close enough to swing, and the boar
  warrior a wall with no feedback. Armour now chips for at least 1.
- **Contact damage during tells and recovery** meant the vulnerable window
  Section 6 asks for did not exist, and a hovering bee was a permanent damage
  aura that could kill a full-health player in the tutorial.
- **Declared hazards did not exist.** `hazard: 'falling'` and `hazard: 'wind'`
  were in the chapter data and implemented nowhere; worse, they fell through to
  the poison branch and laid damaging floor tiles. Both are now real: authored
  falling branches with a shudder-and-strike-line telegraph, and a gust cycle
  that bends jump arcs after a warning.
- **Health fragments** were placed by a modulo on the beat index, giving about
  six across the campaign against Appendix B's target of 20-28. Each chapter now
  carries an authored quota; 27 are placed at fixed locations.
- **Road Ash had nothing to buy.** It is now spent on Vow tiers at a restored
  waystone, which is the loop Section 5 describes but never closes.

Still needing a human: foreground readability, audio zone transitions, encounter
pacing, and whether any of it is actually fun.
