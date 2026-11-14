# Pyramids Timer Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax. Follow repo style from the user's CLAUDE.md (braces on every `if`, blank line before `if`/`for`/`return`, no single-letter names, numeric separators, no comments unless non-obvious why). Conventional commits (`feat(timer): ...`). Stage and stop; do not commit before the user runs `/crit`.

Spec: `docs/specs/2026-11-14-pyramids-timer-design.md`
Assumes the confirmed decisions in the spec: shared rest only, last rest dropped, strictly ascending layers, no max layer count, saving deferred to slice 2.

Goal (slice 1): new "pyramids" timer type, run-only, with a save-friendly data model `{ type, name, mode, layers: [work_sec...], rest_sec, warning_lead_sec }`.

Architecture: pure `public/js/pyramids.js` (`stepsOf`, `validatePyramid`); `schedule.js` total branch; `timer.js` segment branch and round-count getter; `app.js`/`index.html`/`styles.css` form and runner labels. No backend, no audio-path change.

Tech: vanilla ES modules, node:test, `npm test`.

## Size and ticket split

Slice 1 (this plan): frontend only, one actor, one layer. About 420 lines (tests about 200, pyramids.js about 60, timer/schedule about 30, app.js about 90, HTML/CSS about 35, sw 3), one PR under the cap. Optional split: PR A Tasks 1-3 (logic and timer, about 250 lines), PR B Tasks 4-5 (UI, about 170, depends on A).
Slice 2 (separate ticket, outlined in the spec only): schema migration, backend branch with branded types, save/list/edit UI. Depends on slice 1 only for the data model.

---

## Task 1: pyramid logic module (about 110 lines)

Files: create `public/js/pyramids.js`, `test/pyramids.test.js`.

- [ ] Failing tests (nested describe per condition):
  - `stepsOf`: when normal `layers [10,20,30]` returns work/rest 10/10,20/20,30/30,20/20,10/10; when hard with `rest_sec 5` every step has rest 5 including the mirrored ones; peak appears once; input not mutated.
  - `validatePyramid`: when fewer than 3 layers `layers_too_few`; when a layer equals the previous `layers_not_ascending`; when a layer is lower than the previous `layers_not_ascending`; when any work < 5 or > 600 `work_out_of_range`; when hard and `rest_sec = layers[0] - 5` returns null; when hard and `rest_sec = layers[0] - 4` `rest_too_close_to_work`; when hard and rest < 1 `rest_out_of_range`; when warning lead >= shortest segment `lead_too_long`; when 15 layers valid returns null (no max); valid normal 10/20/30 lead 3 returns null.
- [ ] Run `node --import tsx --test test/pyramids.test.js`, expect FAIL.
- [ ] Implement named exports `stepsOf`, `validatePyramid` (constants `MIN_LAYERS = 3`, `MIN_WORK_SEC = 5`, `MAX_WORK_SEC = 600`, `HARD_REST_GAP_SEC = 5`). No barrel; style as `random-hiit.js`.
- [ ] Run, expect PASS.

## Task 2: totals in schedule.js (about 40 lines)

Files: modify `public/js/schedule.js`, `test/schedule.test.js`.

- [ ] Failing tests: when normal `layers [10,20,30]` total 170; when hard `layers [20,30,40]`, `rest_sec 10` total = (20+30+40+30+20) + 4*10 = 180.
- [ ] Add `pyramidTotalSeconds(workout)` (via `stepsOf`) = sum work + sum rest minus last step rest; add `pyramids` branch in `workoutTotalSeconds`.
- [ ] Run, expect PASS.

## Task 3: timer segments and cues (about 90 lines)

Files: modify `public/js/timer.js` (`buildSegments`), `test/timer-chunks.test.js`.

- [ ] Failing tests with a pyramid fixture (`type: 'pyramids'`, `mode: 'normal'`, `layers [10,20,30]`, `rest_sec: 0`, `warning_lead_sec: 3`):
  - segments alternate work,rest ... last is work; 9 segments; `round` runs 1..5 for work segments, rests share the preceding round.
  - last segment `end` equals `startTime + totalDuration`.
  - cues: final two bells at last work end and +0.34; each non-last work end has a `restCue`; each rest end has a work-start `bell`.
  - covers every cue exactly once across chunk windows (reuse the existing coverage helper); `trackEnd` equals last window `to`.
  - when a step has `rest_sec` 0 no rest segment is emitted for it.
- [ ] Run, expect FAIL.
- [ ] `buildSegments`: add a `pyramids` branch using `stepsOf(this.workout)`, per-step durations; skip rest on the last step or when rest is 0.
- [ ] Replace the two `totalRounds: this.workout.rounds` uses in `loop` with a getter that returns `stepsOf(...).length` for pyramids and `workout.rounds` otherwise (test: update emitted `totalRounds` is 5 for the fixture).
- [ ] Run full `npm test`; existing tests must pass untouched.

## Task 4: form UI (about 130 lines)

Files: modify `public/index.html`, `public/js/app.js`, `public/styles.css`.

- [ ] HTML: add `<button class="type-opt" data-type="pyramids">Pyramids</button>`; add `.type-fields[data-for="pyramids"]` with mode toggle (two radio/segmented buttons), `#pyramid-layers` container, "Add layer" and per-row "Remove" buttons, `#w-pyramid-rest` (single shared rest, hard mode only, shown via a `hidden` toggle), preview `<p id="w-pyramid-preview">`. Hide Rounds for pyramids (extend the `data-except` mechanism in `setType`; keep random behaviour unchanged).
- [ ] `app.js`:
  - `TYPE_LABELS.pyramids = 'Pyramids'`.
  - render layer rows (start 3, work default 10/20/30), add (no max) and remove (floor 3), mode toggle, all listeners call `updateFormDerived`.
  - `updateFormDerived` pyramids branch: preview string and total through `stepsOf` / `pyramidTotalSeconds`.
  - submit: when `currentType === 'pyramids'` build `{ type, name, mode, layers, rest_sec (0 in normal), warning_lead_sec }`, `validatePyramid`, error via `errorMessage`/new snake_case message map entries, then `openRunner` always (slice 1 is run-only, also when logged in).
  - `form-submit` label 'Start' for pyramids regardless of login (extend `setType`; slice 2 reverts this for logged-in users).
  - `phaseLabel` pyramids case: `WORK · Step n / total` / `REST · Step n / total` (total from the stepsOf count); `runnerHeading` summary.
  - `workoutItem` not needed (not saved).
- [ ] CSS: layer row layout reusing existing input styles; mobile portrait and landscape checks; rows keep tap targets at least 44px (per PRODUCT.md).
- [ ] `npm run lint` clean.

## Task 5: service worker and manual QA (about 10 lines)

Files: modify `public/sw.js`.

- [ ] Add `'/js/pyramids.js'` to SHELL; bump `CACHE` `emom-shell-v9` to `emom-shell-v10`.
- [ ] Manual QA (qa-verifier): normal 10/20/30 runs 10/10,20/20,30/30,20/20,10 and ends on work with double bell; total shows 02:50; hard layers 20/30/40 rest 10 and rest 26 with first layer 30 rejected (limit 25) with message; adding a 15th layer works; equal or descending layers rejected; progress bar fills across all steps; background/pause behaviour unchanged; logged-in user sees Start (no save).
