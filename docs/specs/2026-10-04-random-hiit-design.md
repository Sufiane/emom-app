# Random HIIT mode - design

Status: revised after user feedback (random burst length, three distinct sounds). Decisions marked [judgment] were made without user confirmation.

## Goal

A third workout type, "Random HIIT". User sets a total time, a minimum rest, and a burst length range. The app plays a start sound at random moments (burst begins: go faster) and a different end sound (burst ends: back to regular pace), and a third, distinct sound when the whole workout ends. Repeats until the total time ends.

## Decisions

1. **Burst length: random per burst within user-set bounds** (user decision). Inputs `burst_min_sec` / `burst_max_sec` (defaults 15 / 30, each 5-120, min <= max). Each burst gets its own integer duration in `[burstMin, burstMax]`. `min == max` is allowed and gives fixed-length bursts.
2. **Rest rule** (user agreed). "Minimum rest" applies to every gap: before the first burst, between bursts, and after the last. A burst always ends at least `minRest` before the total ends.
3. **Burst count: random** [judgment]. `nMax = floor((total - rest) / (burstMin + rest))` (the count that fits when every burst is as short as allowed). Count is drawn uniformly from `[max(1, ceil(nMax / 2)), nMax]`. This keeps tight configs from being fully deterministic.
4. **Schedule algorithm** [judgment], in whole seconds, with a feasibility guarantee. For a drawn count `n`:
   1. `free = total - (n + 1) * rest - n * burstMin`. Always `>= 0` because `n <= nMax`.
   2. Draw each burst's extra length `extra_i` uniformly in `[0, burstMax - burstMin]`.
   3. If `sum(extra) > free`, scale every extra down: `extra_i = floor(extra_i * free / sum)`. Scaling keeps each duration in `[burstMin, burstMax]`, treats all bursts equally (no early/late bias), and makes the total fit.
   4. `slack = free - sum(extra)` (`>= 0`) is split among the `n + 1` gaps by `n` sorted random integers in `[0, slack]` (differences become the extra gap time).
   RNG call order is fixed: count, then `n` extras, then `n` cuts (tests rely on it).
5. **Validation, one source of truth.** `validateRandomConfig(config)` in `random-hiit.js` returns `null` or an error code: `burst_range_invalid` (min > max) or `total_too_short` (`nMax < 1`, i.e. total < `burstMin + 2 * rest`). The generator throws `Error(code)`; the form calls the same function and maps codes to readable messages. Codes are snake_case per project convention.
6. **Pre-computed at Start, not live.** The existing engine renders the whole cue timeline into one WAV so audio survives backgrounding (see `public/js/timer.js` header). The schedule is generated inside `WorkoutTimer.start()`, so Reset and "Run again" yield a fresh schedule. [judgment: no seed/replay feature]
7. **Injectable RNG.** `generateBurstSchedule` takes `random` (`() => number` in `[0, 1)`, default `Math.random`). `WorkoutTimer` takes an optional `random` and forwards it.
8. **Three distinct sounds, all synthesized in `timer.js` and rendered into the offline track** (user decision; exact parameters are my design [judgment]):
   - **Burst start** `playBurstStartCue`: rising, urgent, short. Three square-wave notes 660, 880, 1320 Hz at 0 / 0.11 / 0.22 s (0.1 / 0.1 / 0.3 s long), about 0.5 s total. Bright and buzzy.
   - **Burst end** `playBurstEndCue`: falling, calm. Three sine notes 784, 587, 392 Hz at 0 / 0.18 / 0.36 s, each a soft ~0.35 s decay, about 0.7 s total. Mellow.
   - **Workout end**: the existing double bell (`playBell` twice, 0.34 s apart). It is metallic with a ~2 s ring-out, a different timbre and much longer than either synth cue, and it is already the app's "workout over" sound in EMOM/Intervals. The old single bell is no longer used in random mode.
   - No warning ring or tic-toc in this mode (they would reveal the next burst). The pre-start countdown beeps are kept. No bell at time 0.
9. **No persistence in v1** [judgment]. Random HIIT runs as a quick workout for guests and logged-in users. Saving would need a new `workouts.type` value, a migration, and mapping `total_sec` / `min_rest_sec` / `burst_min_sec` / `burst_max_sec` onto columns that don't fit. So there is **no backend work** and backend branded-type rules do not apply (frontend is untyped plain JS).
10. **No new dependencies.** Tests use Node's built-in `node:test`; add `"test": "node --test test/"`.

## Workout shape

`{ name, type: 'random', total_sec, min_rest_sec, burst_min_sec, burst_max_sec }`

## Hidden-timing UX

- During **rest**, the big clock shows *total remaining*, not time to next burst. Label `REST`; sub-line empty.
- During a **burst**, the big clock shows burst time remaining. Label `GO · Burst k`; sub-line `Total remaining mm:ss`.
- Bursts are labelled by index only; total burst count is not shown.
- Runner `data-phase` reuses `work` (burst) and `rest`, so existing phase colours apply.
- Runner heading: `Random HIIT · mm:ss · bursts 15-30s` (name prefixed when set).

## Form

Third tab `Random HIIT` (`data-type="random"`):

| Field | Input | Range | Default |
|---|---|---|---|
| Total (minutes) | number, step 0.5 | 1-60 | 2 |
| Minimum rest (s) | number | 5-120 | 15 |
| Shortest burst (s) | number | 5-120 | 15 |
| Longest burst (s) | number | 5-120 | 30 |

Rounds and Warning-lead controls are hidden for this type. A derived line shows `Up to N bursts` (`N = maxBursts` using the shortest burst). Submit label is `Start` for this type even when logged in; Name is optional. Errors in `#form-error`:
- `burst_range_invalid`: `Shortest burst must not exceed longest burst`
- `total_too_short`: `Total too short: need at least {burstMin + 2*rest}s`

## Components

- `public/js/random-hiit.js` (new, pure, no DOM/audio):
  - `maxBursts({ totalSec, minRestSec, burstMinSec }): number`
  - `validateRandomConfig({ totalSec, minRestSec, burstMinSec, burstMaxSec }): null | 'burst_range_invalid' | 'total_too_short'`
  - `generateBurstSchedule({ totalSec, minRestSec, burstMinSec, burstMaxSec, random }): Array<{ start, end }>` (integer seconds from workout start; throws the validation code)
  - `segmentsFromBursts(bursts, totalSec, offset): Array<{ kind: 'rest'|'work', round, start, end }>`
- `public/js/timer.js` (modify): two new cue functions (`playBurstStartCue`, `playBurstEndCue`); `WorkoutTimer` random branch for `totalDuration`, `buildSegments`, cue scheduling, and `onUpdate` payload (`remainingPhase: null` during rest).
- `public/js/app.js` + `public/index.html` (modify): form tab, fields, payload, runner labels/clock rules, `workoutTotalSeconds`.
- `public/sw.js` (modify): cache `/js/random-hiit.js`, bump to `emom-shell-v6`.

## Testing

`test/random-hiit.test.js` (`node:test`, nested `describe` per condition): scripted-RNG cases (min-everything, max-everything with scale-down, mid values), validation codes, and a seeded sweep over several configs (including `burstMin == burstMax`) asserting: every duration within bounds, every gap >= `minRest` (lead-in, between, tail), last end <= `total - minRest`, integer times, count within bounds, never infeasible. Cues and DOM wiring verified manually in a browser (three sounds distinguishable by ear, background playback, pause/resume, reset regenerates).

## Out of scope

Saving random workouts, user-set burst count, seeds/replay, backend changes.
