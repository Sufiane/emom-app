# Pyramids timer type

Date: 2026-11-14
Scope of slice 1 (this spec's plan): frontend only (`public/`, `test/`), run-only. Saving is slice 2 (see Follow-up).

## Problem

Users want a pyramid workout: work/rest layers that climb to a peak and then descend. A pyramid cannot be expressed as Intervals because work time changes per layer.

## Behaviour

User enters the ascending layers only (peak last, minimum 3, strictly ascending by work time; equal work times are rejected). The app derives the descent by mirroring the ascent, excluding the peak. Ascent `[a, b, c]` runs steps `a, b, c, b, a` (2L-1 steps).

### Modes

- Normal: one work time per layer; rest equals work for that step. 10/20/30 runs 10/10, 20/20, 30/30, 20/20, 10/10.
- Hard: one work time per layer plus ONE shared rest value for every step (ascent and mirrored descent). Rule: `rest <= work - 5` for every layer. Because layers ascend, layer 1 is the shortest, so the check is `rest <= layers[0] - 5`.

### Final rest

The last rest is dropped (same as the 2026-11-01 interval change). Normal 10/20/30: work 90 s, rests 80 s, total 170 s.

### Bounds

Minimum 3 layers, no maximum. Work 5 to 600 s per layer. Hard rest 1 s up to `layers[0] - 5` (so hard needs `layers[0] >= 6`). Warning lead must be shorter than the shortest segment.

## Data model (save-friendly, final for slice 1 and 2)

```
{ type: 'pyramids', name, mode: 'normal'|'hard', layers: [work_sec, ...], rest_sec, warning_lead_sec }
```

- `layers`: ascending work seconds, user input only.
- `rest_sec`: the shared rest in hard mode; `0` in normal mode (ignored, rest is derived from work).
- Steps are never stored. `stepsOf(workout)` derives `[{ work_sec, rest_sec }]` at runtime, so a row loaded in slice 2 runs through the same code path with no conversion. `rounds` is not part of the workout; the timer derives the step count.

## Design (slice 1)

### New pure module `public/js/pyramids.js`

- `stepsOf(workout)`: expands layers by mirroring, applies mode (normal rest = work, hard rest = shared).
- `validatePyramid(workout)` returns a snake_case code or null: `layers_too_few`, `layers_not_ascending` (any layer `<=` previous), `work_out_of_range`, `rest_out_of_range` (hard, rest < 1), `rest_too_close_to_work` (hard, `rest > layers[0] - 5`), `lead_too_long`. Pattern follows `validateRandomConfig`.

### `schedule.js`

`pyramidTotalSeconds(workout)` = sum of step work + sum of step rest minus the last step's rest. `workoutTotalSeconds` gains a `pyramids` branch, so list/form/runner totals and `totalDuration` stay consistent.

### `timer.js`

- `buildSegments` pyramids branch: for each step i push work (`round: i + 1`), then rest unless it is the last step or rest is 0.
- `totalRounds` in `loop` comes from a small getter (`stepsOf(...).length` for pyramids, `workout.rounds` otherwise).
- Cues, chunk windows, `playback.js`, progress bar: unchanged (segment-driven). A test asserts every cue is covered once for a pyramid.

### UI (`index.html`, `app.js`, `styles.css`, `sw.js`)

- Fourth tab "Pyramids" in the type picker; `TYPE_LABELS.pyramids`.
- Form: Normal/Hard toggle; dynamic layer rows (start at 3, add and remove, floor 3); one shared "Rest seconds" input shown in hard mode only; live preview of the full sequence and total. Rounds field hidden; warning lead slider kept.
- Submit builds the workout object, runs `validatePyramid`, shows messages for the codes above, and calls `openRunner`. Button reads "Start" (also for logged-in users) in slice 1.
- Runner label `WORK · Step n / total`, heading `Pyramids · N layers · mm:ss`.
- Service worker: add `/js/pyramids.js`, bump cache `v9` to `v10`.

## Testing

Node `--test`, nested `describe` per condition: `test/pyramids.test.js` (stepsOf, every validation code and boundary, including equal layers rejected and hard rest exactly `layers[0]-5` valid), `test/schedule.test.js` (170 s example, hard example), `test/timer-chunks.test.js` (segments, last segment is work, cue coverage, final double bell). DOM checked manually in portrait and landscape.

## Follow-up: slice 2 (separate ticket, not planned in detail)

Rough scope, about 600-800 lines, to be split by layer when planned:

- Schema: migration adding `mode TEXT` and `layers TEXT` (JSON array of ints) to `workouts`; `rest_sec` reused for the shared rest; `rounds`/`work_sec` NULL for pyramids; update `schema.sql` comments.
- Backend: `PyramidsInput`/`PyramidsClean` in `workouts.service.ts` with `validatePyramids` mirroring `validatePyramid` rules (same snake_case codes), new brands (`PyramidMode`, `LayerSec`), JSON (de)serialisation confined to `workouts.db.ts`, service stays ORM-free per hexagonal rules; service tests.
- Web: Save/Edit for pyramids, list summary item, error-message map, prefill the form from a saved row.
- Slice 1's data model needs no rework for this.

## Out of scope

Presets, per-layer rest in hard mode, non-mirror descents.
