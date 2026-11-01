# Interval final-rest removal and workout progress bar

Date: 2026-11-01
Scope: frontend only (`public/`), no API, schema or backend change.

## Problem

1. Interval workouts with N rounds currently schedule N work and N rest
   periods. The last rest has no following work, so the workout drags on
   after the final round and the closing bell sounds after a pointless rest.
   Intended: N work periods, N-1 rests.
2. The runner shows only the current phase colour (red WORK, amber REST) and
   text. There is no glanceable sense of where the user is in the whole
   workout.

## Part 1: N-1 rests

### Where the rule matters (audit)

| Place | File | Today | Change |
|---|---|---|---|
| Duration | `public/js/timer.js` `totalDuration` | `rounds * (work + rest)` | `rounds * work + (rounds - 1) * rest` |
| Segments | `timer.js` `buildSegments` | pushes rest after every round | skip rest after the last round |
| Cues | `timer.js` `addSegmentEndCues` | next==null gives double closing bell | no change; last segment is now work, so the double bell lands at the work end automatically. The preceding-to-last rest ends with the normal work-start bell |
| Chunk windows | `timer.js` `chunkWindows`, `renderChunk` | derived from `trackEnd` = start + totalDuration | no change; shrinks consistently because both read `totalDuration`. Closing bells (past `trackEnd`) still owned by the last window |
| Playback track length | `playback.js` | takes `trackSeconds` from timer | no change |
| Runner loop | `timer.js` `loop` | uses `totalDuration` and last segment | no change |
| Saved-list total | `app.js` `workoutTotalSeconds` | `rounds * (work + rest)` | use shared helper |
| Form total preview | `app.js` `updateFormDerived` | same formula | use shared helper |
| Runner "Total" label | `app.js` `openRunner` | via `workoutTotalSeconds` | follows helper |
| Backend | `src/` | does not compute totals (verified by grep) | none |
| Tabata/HIIT presets | `app.js` | fill inputs only | none |

Rest of 0 (EMOM) is unaffected: `(rounds - 1) * 0 = 0`. Rounds of 1 gives
zero rests. Random HIIT is untouched (it already ends on a burst or its own
schedule).

### Single source of truth

New pure module `public/js/schedule.js`:

- `intervalTotalSeconds({ rounds, work_sec, rest_sec })` returns
  `rounds * work_sec + Math.max(0, rounds - 1) * (rest_sec || 0)`.
- `workoutTotalSeconds(workout)` handles `random` (total_sec) vs the above.

`timer.js` and `app.js` both import it, so the three formula copies cannot
drift. `buildSegments` keeps its loop but guards the rest push with
`round < rounds`; a timer test asserts the segment end equals
`totalDuration` so schedule and total cannot disagree.

Add `/js/schedule.js` to the service worker SHELL list and bump the cache
name (`emom-shell-v8` to `v9`) so installed PWAs pick up the change.

### Behaviour change note

Existing saved workouts shorten by one rest period on next run. No data
migration is needed because `rest_sec` semantics are unchanged.

## Part 2: progress bar

### Decision

A full-width horizontal progress bar on the runner, filled left to right by
overall elapsed time, not a colour shift of the timer text.

### Why not shift the big-time colour across the workout

- PRODUCT.md principle 4: phase (WORK/REST) must be unambiguous, "no
  guess-the-colour". Text colour already encodes the phase (accent vs amber).
  Gradient hues over progress would collide with it.
- PRODUCT.md anti-references forbid neon gradients and gradient text on the
  timer.
- Colour alone fails for colour-blind users and in sunlight; bar length
  encodes progress by position and size.

### Design

- Element: `<div id="run-progress" class="run-progress" aria-hidden="true">`
  containing one `<div class="run-progress-fill">`, placed in `.runner-stack`
  directly under `#run-total`. Decorative for assistive tech because the
  textual "Total remaining mm:ss" already conveys the same, and a live
  progressbar role would add screen reader noise every frame.
- Fill width driven by CSS custom property `--progress` (0 to 1) set on
  `#view-runner` from `onRunUpdate`; fill uses `transform: scaleX(var(--progress))`
  with `transform-origin: left` (no layout, no transition, so no motion issue
  and `prefers-reduced-motion` needs no special case).
- Fill colour follows the existing phase: `--accent` for WORK/countdown,
  `--warn` for REST, reusing `#view-runner[data-phase="rest"]` selector. This
  reinforces rather than competes with the text colour.
- Track: 1px `--muted` outline (oklch 0.68 on bg 0.13, well over the 3:1
  non-text contrast requirement) so the empty remainder, and thus the end of
  the bar, is visible. Height 0.75rem portrait, 0.6rem landscape. Fill accent
  and amber both exceed 3:1 against the dark track.
- Paused: bar opacity 0.55, matching `.big-time`.
- States: idle and countdown show 0; finished shows 1; Reset and `openRunner`
  reset to 0.
- Progress definition: `elapsed / totalDuration`, clamped to [0, 1], where
  elapsed excludes the 3 second pre-roll. Applies to all workout types
  including random (uses `total_sec`).
- Landscape (`max-height: 600px`): bar stays in the stack below the total,
  full width, shorter height.

### Data flow

`WorkoutTimer.loop` already computes `elapsed` and `total`. Add
`progress` to the object passed to `onUpdate` (0 during the countdown, 1 at
the finish update). `app.js` `onRunUpdate` and `renderRandomUpdate` write it
to `--progress`. No audio code is touched.

### Out of scope (candidate follow-up tickets)

- Per-round tick marks on the bar. Ticks are uneven once the last round has
  no rest, and up to 120 rounds makes them noisy.
- Remembering the bar when the page is backgrounded beyond what the existing
  loop already does.

## Risk to existing audio work

Part 1 changes only `totalDuration` and the segment list. Chunk windows, cue
windows and playback track length are all derived from them, so no change to
`playback.js`, `renderChunk`, or cue scheduling. Existing chunk tests use
EMOM fixtures with `rest_sec: 20`; assertions are relational (`trackEnd`) so
they keep passing, and new tests pin the exact totals. Part 2 adds no audio
path changes.

## Testing

Node `--test` (existing runner). New `test/schedule.test.js` for the helper;
additions to `test/timer-chunks.test.js` for segments, cues and windows;
a loop test (stubbed `requestAnimationFrame` and playback position as in
`test/timer-audio-session.test.js`) for `progress`. DOM/CSS verified manually
on the runner (portrait and landscape, work and rest, paused).

## Resolved decisions

- Progress bar over colour shift (above).
- Bar fill follows phase colour; no third hue introduced.
- Bar is aria-hidden; no new live region.
- Shared `schedule.js` helper over fixing three formulas inline.
- No ticks in v1.
- Part 1 applies to any workout with `rest_sec > 0`, not gated by type string,
  because EMOM stores `rest_sec = 0`.
