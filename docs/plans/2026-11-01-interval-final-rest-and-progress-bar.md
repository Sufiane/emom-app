# Interval final-rest removal and progress bar Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax. Follow repo style from the user's CLAUDE.md (braces on every `if`, blank line before `if`/`for`/`return`, no single-letter names, numeric separators, no comments unless non-obvious why). Commits are conventional (`feat(timer): ...`), lowercase imperative. Stage and stop; do not commit before the user runs `/crit`.

Spec: `docs/specs/2026-11-01-interval-final-rest-and-progress-bar-design.md`

Goal: N-1 rests in interval workouts everywhere totals/schedules are computed, plus a phase-coloured elapsed-progress bar on the runner.

Architecture: pure helper `public/js/schedule.js` shared by `timer.js` and `app.js`; timer emits `progress` in `onUpdate`; `app.js` sets `--progress`; CSS draws bar. No backend, no audio-path changes.

Tech: vanilla ES modules, node:test, run with `npm test` (node --import tsx --test).

## Size and ticket split

Fits a single PR. Estimate: about 330 lines total (tests about 190, code about 90, CSS/HTML about 45, sw about 3). Well under the 800 cap, single actor, single layer (web). Optional split if reviewer prefers: PR A = Tasks 1-3 (final rest, about 200 lines), PR B = Tasks 4-6 (progress bar, about 130 lines, depends on A only for `workoutTotalSeconds`). Recommended: one PR.

---

## Task 1: shared total helper (about 50 lines)

Files: create `public/js/schedule.js`, `test/schedule.test.js`.

- [ ] Write failing tests in `test/schedule.test.js` using nested `describe` per condition:
  - when rest is 0: `intervalTotalSeconds({rounds: 10, work_sec: 60, rest_sec: 0})` = 600
  - when rest > 0: `{rounds: 8, work_sec: 20, rest_sec: 10}` = 230 (8*20 + 7*10)
  - when rounds is 1: `{rounds: 1, work_sec: 30, rest_sec: 20}` = 30
  - when rest_sec undefined (EMOM rows): treated as 0
  - `workoutTotalSeconds` returns `total_sec` for random and the interval formula otherwise
- [ ] Run `npm test -- test/schedule.test.js` (or `node --import tsx --test test/schedule.test.js`), expect FAIL (module missing).
- [ ] Implement `intervalTotalSeconds` and `workoutTotalSeconds` exports (named, explicit; no barrel).
- [ ] Run test, expect PASS.

## Task 2: timer uses N-1 rests (about 70 lines)

Files: modify `public/js/timer.js` (`totalDuration`, `buildSegments`), `test/timer-chunks.test.js`.

- [ ] Add failing tests in `test/timer-chunks.test.js` (reuse `timerFor`, `EMOM` fixture = 3 rounds, 40 work, 20 rest):
  - describe "when the workout has rest between rounds":
    - segments are work,rest,work,rest,work (5 segments, last kind `work`)
    - `totalDuration` = 3*40 + 2*20 = 160
    - last segment `end` equals `startTime + totalDuration`
    - `trackEnd` equals the last window `to`
  - describe "when rounds is 1": exactly one work segment, no rest
  - describe "when rest_sec is 0": segments are work only, count = rounds (regression)
  - describe "closing cues": the two final `bell` cues sit at last work end and end + 0.34; no `restCue` after the last work segment start; the final warning/tickTock cues are anchored to the final work end
  - describe "cue coverage": existing "covers every cue exactly once" still passes with the new schedule
- [ ] Run, expect FAIL.
- [ ] `totalDuration`: replace interval branch with `intervalTotalSeconds(this.workout)` (import from `./schedule.js`).
- [ ] `buildSegments`: guard rest push with `if (rest_sec > 0 && round < rounds)`.
- [ ] Run full `npm test`; existing `timer-chunks`, `playback-chunks`, `timer-audio-session` must still pass (they assert relationally on `trackEnd`). Fix any hard-coded totals in tests that assumed a trailing rest (expected: none, verify).

## Task 3: UI totals use the helper + SW (about 40 lines)

Files: modify `public/js/app.js`, `public/sw.js`.

- [ ] `app.js`: delete the local `workoutTotalSeconds`; import `workoutTotalSeconds` and `intervalTotalSeconds` from `./js/schedule.js` (match existing import path style in the file). In `updateFormDerived` replace the inline intervals total with `intervalTotalSeconds({ rounds, work_sec: Number(workInput.value) || 0, rest_sec: Number(restInput.value) || 0 })`; the EMOM branch stays `rounds * Number(intervalInput.value)`.
- [ ] `sw.js`: add `'/js/schedule.js'` to SHELL and bump `CACHE` from `emom-shell-v8` to `emom-shell-v9`.
- [ ] Manual check (QA): form shows Total = 8x20 + 7x10 = 03:50 for Tabata preset; saved list summary and runner "Total" agree; a 1-round interval shows work-only total.
- [ ] `npm run lint` clean.

## Task 4: timer emits progress (about 60 lines)

Files: modify `public/js/timer.js` `loop`; extend `test/timer-audio-session.test.js` or new `test/timer-progress.test.js` reusing its globals stubs (rAF collected into `frames`).

- [ ] Failing tests (describe per condition), driving `timer.loop()` with `timer.playback = { position }` stub and capturing `onUpdate`:
  - when in the countdown: `progress` is 0
  - when halfway: `progress` is about 0.5 (`elapsed / totalDuration`)
  - when past the end: final update has `progress` 1
  - random workout: progress uses `total_sec`
- [ ] Implement: compute `progress = Math.min(1, Math.max(0, elapsed / total))`; include in countdown (0), finish (1) and running updates. Do not change `remaining*` fields.
- [ ] Run tests, expect PASS.

## Task 5: runner markup, CSS, wiring (about 55 lines)

Files: modify `public/index.html`, `public/styles.css`, `public/js/app.js`.

- [ ] `index.html`: after `#run-total` add `<div id="run-progress" class="run-progress" aria-hidden="true"><div class="run-progress-fill"></div></div>`.
- [ ] `styles.css` (near the runner rules, before the landscape media query):
  - `.run-progress`: `height: 0.75rem; border: 1px solid var(--muted); border-radius: var(--radius); overflow: hidden; margin: 0.75rem 0 0;`
  - `.run-progress-fill`: `height: 100%; background: var(--accent); transform: scaleX(var(--progress, 0)); transform-origin: left;`
  - `#view-runner[data-phase="rest"] .run-progress-fill { background: var(--warn); }`
  - `#view-runner[data-state="paused"] .run-progress { opacity: 0.55; }`
  - landscape media query: `body[data-view="runner"] .run-progress { height: 0.6rem; margin-top: 0.3rem; }`
  - confirm the CSS-rotate landscape block (`body.landscape-rotate`) does not need overrides; check visually.
- [ ] `app.js`: add `setProgress(fraction)` helper that sets `runnerSection.style.setProperty('--progress', String(fraction))`. Call in `onRunUpdate` (all non-random branch and countdown with 0), `renderRandomUpdate`, `onRunFinish` (1), and `openRunner` (0, which also covers Reset).
- [ ] `npm run lint` clean.

## Task 6: verification and handoff (about 40 lines of checklist, no code)

- [ ] `npm test`, `npm run typecheck`, `npm run lint` all green.
- [ ] Manual in browser (use `run`/dev server) on portrait and landscape, mixing on and off: Tabata preset run: bar grows left to right, turns amber during REST, dims on pause, empty at idle and after Reset, full at finish; the final work ends with the double bell and no trailing rest; audio chunk boundaries (every 60s) show no gaps with a 10+ round workout.
- [ ] Check contrast: bar outline and fill against `--bg`.
- [ ] Stage changes and stop; tell the user to run `/crit`.

## Independence

Frontend only. Tasks 1-3 and 4-5 are independent of each other except both touch `timer.js`/`app.js`, so run sequentially with one builder (`frontend-builder`). No `backend-builder` work.
