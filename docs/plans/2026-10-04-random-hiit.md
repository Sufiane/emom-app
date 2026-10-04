# Random HIIT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Random HIIT" workout type that plays a start sound and a different end sound for random-length bursts at random moments within a total time, respecting a minimum rest, and a third distinct sound when the workout ends.

**Architecture:** A pure schedule generator (`public/js/random-hiit.js`, injectable RNG, feasibility-guaranteed) produces burst times at Start. `WorkoutTimer` converts them to segments and renders the full cue track up front (three distinct cues), exactly like existing workouts, so background playback keeps working. UI adds a third form tab and runner rules that hide the time-to-next-burst. Frontend-only; no backend, DB or dependency changes.

**Tech Stack:** Plain ES-module JS (no build), Web Audio `OfflineAudioContext`, Node built-in `node:test` for unit tests.

**Spec:** `/Users/sufianesouissi/conductor/workspaces/emom-app/san-antonio/docs/specs/2026-10-04-random-hiit-design.md`

## Global Constraints

- No new dependencies; tests use `node:test` (Node 24). Do not touch `package.json` dependency versions.
- Code style (applies to JS too): no single-letter names except `i`/`j`/`k` in indexed `for` loops; always brace `if`/`for` bodies on their own lines; blank line before `if`/`for`/`while`/`return`/`throw` unless first in block; no `!!x`; numeric separators on literals of 5+ digits; no barrel files; no comments unless a non-obvious why; delete dead code. Error codes are snake_case.
- Test style: nest a `describe` per condition ("when ..."), `it` titles state only the outcome; shared setup in that `describe`'s `beforeEach`.
- Workout object shape: `{ name, type: 'random', total_sec, min_rest_sec, burst_min_sec, burst_max_sec }`.
- Rest rule: every gap (lead-in, between bursts, tail) is >= `min_rest_sec`. Each burst has its own integer duration in `[burst_min_sec, burst_max_sec]`. Count is random in `[max(1, ceil(nMax/2)), nMax]`, `nMax = floor((total - rest) / (burstMin + rest))`.
- RNG call order in the generator is fixed: count, then `count` extras, then `count` cuts.
- Three distinct cues in random mode: burst start `playBurstStartCue` (rising square), burst end `playBurstEndCue` (falling sine), workout end = existing double bell. No warning/tic-toc cues, no bell at time 0.
- During rest the big clock shows total remaining, never time-to-next-burst.
- Git: stage changes and stop for the user's `/crit` review rather than committing. When the user approves, commit with Conventional Commits (`feat(random-hiit): ...`) and the attribution trailer.

## File Structure

- Create `public/js/random-hiit.js`: pure schedule logic (no DOM, no audio).
- Create `test/random-hiit.test.js`: unit tests for it.
- Modify `public/js/timer.js`: two new cue functions, random branch in `WorkoutTimer`.
- Modify `public/index.html`: third tab, fields, hidden-for-random markers.
- Modify `public/js/app.js`: form + runner wiring.
- Modify `public/sw.js`: cache new file, bump version.
- Modify `package.json`: add `test` script only.

Dependency order: 1 -> 2 -> (3, 4) -> 5 -> 6 -> 7. All frontend.

---

### Task 1: Burst schedule generator and validation

**Files:**
- Create: `public/js/random-hiit.js`
- Create: `test/random-hiit.test.js`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces:
  - `maxBursts({ totalSec, minRestSec, burstMinSec }): number`
  - `validateRandomConfig({ totalSec, minRestSec, burstMinSec, burstMaxSec }): null | 'burst_range_invalid' | 'total_too_short'` (range check first, then fit)
  - `generateBurstSchedule({ totalSec, minRestSec, burstMinSec, burstMaxSec, random = Math.random }): Array<{ start: number, end: number }>` integer seconds from workout start; throws `Error(code)` with the validation code.

- [ ] **Step 1: Add the test script**

In `package.json` `scripts`, add after `"lint"`:

```json
"test": "node --test test/",
```

- [ ] **Step 2: Write the failing tests**

Create `test/random-hiit.test.js`:

```js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateBurstSchedule, maxBursts, validateRandomConfig } from '../public/js/random-hiit.js';

function scriptedRandom(values) {
  let index = 0;

  return () => {
    const value = values[index % values.length];
    index += 1;

    return value;
  };
}

function seededRandom(seed) {
  let state = seed;

  return () => {
    state = (state + 0x6d_2b_79_f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const CONFIG = { totalSec: 120, minRestSec: 15, burstMinSec: 15, burstMaxSec: 30 };

describe('maxBursts', () => {
  describe('when every burst is as short as allowed', () => {
    it('counts bursts that fit with rest on both sides', () => {
      assert.equal(maxBursts(CONFIG), 3);
    });
  });

  describe('when the total is too short for one burst', () => {
    it('returns 0', () => {
      assert.equal(maxBursts({ ...CONFIG, totalSec: 40 }), 0);
    });
  });
});

describe('validateRandomConfig', () => {
  describe('when the config is valid', () => {
    it('returns null', () => {
      assert.equal(validateRandomConfig(CONFIG), null);
    });
  });

  describe('when the shortest burst exceeds the longest', () => {
    it('returns burst_range_invalid', () => {
      assert.equal(
        validateRandomConfig({ ...CONFIG, burstMinSec: 30, burstMaxSec: 15 }),
        'burst_range_invalid'
      );
    });
  });

  describe('when the total is too short for one burst', () => {
    it('returns total_too_short', () => {
      assert.equal(validateRandomConfig({ ...CONFIG, totalSec: 40 }), 'total_too_short');
    });
  });
});

describe('generateBurstSchedule', () => {
  describe('when the burst range is invalid', () => {
    it('throws burst_range_invalid', () => {
      assert.throws(
        () => generateBurstSchedule({ ...CONFIG, burstMinSec: 30, burstMaxSec: 15 }),
        { message: 'burst_range_invalid' }
      );
    });
  });

  describe('when the total is too short for one burst', () => {
    it('throws total_too_short', () => {
      assert.throws(
        () => generateBurstSchedule({ ...CONFIG, totalSec: 40 }),
        { message: 'total_too_short' }
      );
    });
  });

  describe('when the rng always returns 0', () => {
    it('places the fewest shortest bursts packed at the start', () => {
      const bursts = generateBurstSchedule({ ...CONFIG, random: () => 0 });

      assert.deepEqual(bursts, [
        { start: 15, end: 30 },
        { start: 45, end: 60 }
      ]);
    });
  });

  describe('when the rng always returns its highest value', () => {
    it('scales the oversized durations down to fit, with no slack', () => {
      const bursts = generateBurstSchedule({ ...CONFIG, random: () => 0.999 });

      assert.deepEqual(bursts, [
        { start: 15, end: 35 },
        { start: 50, end: 70 },
        { start: 85, end: 105 }
      ]);
    });
  });

  describe('when the rng yields mid values', () => {
    it('draws per-burst durations and spreads the slack across the gaps', () => {
      const bursts = generateBurstSchedule({ ...CONFIG, random: scriptedRandom([0, 0.5, 0.5, 0.5, 0.5]) });

      assert.deepEqual(bursts, [
        { start: 30, end: 53 },
        { start: 68, end: 91 }
      ]);
    });
  });

  describe('when run over many random seeds and configs', () => {
    const configs = [
      CONFIG,
      { totalSec: 300, minRestSec: 20, burstMinSec: 10, burstMaxSec: 40 },
      { totalSec: 60, minRestSec: 5, burstMinSec: 5, burstMaxSec: 5 },
      { totalSec: 3600, minRestSec: 120, burstMinSec: 30, burstMaxSec: 120 },
      { totalSec: 50, minRestSec: 15, burstMinSec: 15, burstMaxSec: 30 }
    ];

    it('keeps every invariant', () => {
      for (const config of configs) {
        const most = maxBursts(config);
        const fewest = Math.max(1, Math.ceil(most / 2));

        for (let seed = 1; seed <= 500; seed++) {
          const bursts = generateBurstSchedule({ ...config, random: seededRandom(seed) });

          assert.ok(bursts.length >= fewest && bursts.length <= most);
          assert.ok(bursts[0].start >= config.minRestSec);
          assert.ok(bursts.at(-1).end <= config.totalSec - config.minRestSec);

          for (let i = 0; i < bursts.length; i++) {
            const duration = bursts[i].end - bursts[i].start;

            assert.ok(Number.isInteger(bursts[i].start) && Number.isInteger(bursts[i].end));
            assert.ok(duration >= config.burstMinSec && duration <= config.burstMaxSec);

            if (i > 0) {
              assert.ok(bursts[i].start - bursts[i - 1].end >= config.minRestSec);
            }
          }
        }
      }
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL (cannot find module `../public/js/random-hiit.js`).

- [ ] **Step 4: Implement**

Create `public/js/random-hiit.js`:

```js
export function maxBursts({ totalSec, minRestSec, burstMinSec }) {
  return Math.floor((totalSec - minRestSec) / (burstMinSec + minRestSec));
}

export function validateRandomConfig({ totalSec, minRestSec, burstMinSec, burstMaxSec }) {
  if (burstMinSec > burstMaxSec) {
    return 'burst_range_invalid';
  }

  if (maxBursts({ totalSec, minRestSec, burstMinSec }) < 1) {
    return 'total_too_short';
  }

  return null;
}

function randomInt(random, maxInclusive) {
  return Math.floor(random() * (maxInclusive + 1));
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

export function generateBurstSchedule({ totalSec, minRestSec, burstMinSec, burstMaxSec, random = Math.random }) {
  const error = validateRandomConfig({ totalSec, minRestSec, burstMinSec, burstMaxSec });

  if (error != null) {
    throw new Error(error);
  }

  const most = maxBursts({ totalSec, minRestSec, burstMinSec });
  const fewest = Math.max(1, Math.ceil(most / 2));
  const count = fewest + randomInt(random, most - fewest);
  const free = totalSec - (count + 1) * minRestSec - count * burstMinSec;

  const extras = [];

  for (let i = 0; i < count; i++) {
    extras.push(randomInt(random, burstMaxSec - burstMinSec));
  }

  const extraTotal = sum(extras);
  const fitted = extraTotal > free
    ? extras.map((extra) => Math.floor((extra * free) / extraTotal))
    : extras;
  const slack = free - sum(fitted);

  const cuts = [];

  for (let i = 0; i < count; i++) {
    cuts.push(randomInt(random, slack));
  }

  cuts.sort((left, right) => left - right);

  const bursts = [];
  let cursor = 0;
  let previousCut = 0;

  for (let i = 0; i < count; i++) {
    cursor += minRestSec + (cuts[i] - previousCut);
    previousCut = cuts[i];

    const duration = burstMinSec + fitted[i];

    bursts.push({ start: cursor, end: cursor + duration });
    cursor += duration;
  }

  return bursts;
}
```

Why it is always feasible: `count <= most` makes `free >= 0`; scaling guarantees `sum(fitted) <= free`; so `slack >= 0`; every gap is `minRestSec` plus a non-negative cut difference, and the tail is `minRestSec + slack - lastCut >= minRestSec`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all tests.

- [ ] **Step 6: Stage**

```bash
git add package.json public/js/random-hiit.js test/random-hiit.test.js
```

---

### Task 2: Segments from bursts

**Files:**
- Modify: `public/js/random-hiit.js`
- Modify: `test/random-hiit.test.js`

**Interfaces:**
- Consumes: burst array from Task 1.
- Produces: `segmentsFromBursts(bursts, totalSec, offset): Array<{ kind: 'rest' | 'work', round: number, start: number, end: number }>`. Alternates rest/work, starts and ends with rest, contiguous over `[offset, offset + totalSec]`. `round` = 1-based burst index for work segments; rest segments carry the index of the last completed burst (0 before the first).

- [ ] **Step 1: Write the failing tests**

Add `segmentsFromBursts` to the import in `test/random-hiit.test.js` and append:

```js
describe('segmentsFromBursts', () => {
  describe('when given two bursts and a start offset', () => {
    const bursts = [{ start: 15, end: 35 }, { start: 50, end: 70 }];
    const segments = segmentsFromBursts(bursts, 120, 3.15);

    it('alternates rest and work, ending on rest', () => {
      assert.deepEqual(
        segments.map((segment) => segment.kind),
        ['rest', 'work', 'rest', 'work', 'rest']
      );
    });

    it('numbers bursts from 1 and carries the last index through rests', () => {
      assert.deepEqual(
        segments.map((segment) => segment.round),
        [0, 1, 1, 2, 2]
      );
    });

    it('is contiguous across the whole offset total', () => {
      assert.equal(segments[0].start, 3.15);
      assert.equal(segments.at(-1).end, 123.15);

      for (let i = 1; i < segments.length; i++) {
        assert.equal(segments[i].start, segments[i - 1].end);
      }
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL (`segmentsFromBursts` is not exported).

- [ ] **Step 3: Implement**

Append to `public/js/random-hiit.js`:

```js
export function segmentsFromBursts(bursts, totalSec, offset) {
  const segments = [];
  let cursor = 0;
  let round = 0;

  for (const burst of bursts) {
    segments.push({ kind: 'rest', round, start: offset + cursor, end: offset + burst.start });
    round += 1;
    segments.push({ kind: 'work', round, start: offset + burst.start, end: offset + burst.end });
    cursor = burst.end;
  }

  segments.push({ kind: 'rest', round, start: offset + cursor, end: offset + totalSec });

  return segments;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
git add public/js/random-hiit.js test/random-hiit.test.js
```

---

### Task 3: Distinct burst cues (synth)

**Files:**
- Modify: `public/js/timer.js` (add after `playRestCue`, ~L168)

**Interfaces:**
- Consumes: existing `masterBus(ctx)` (limiter bus).
- Produces: `playBurstStartCue(ctx, time)` and `playBurstEndCue(ctx, time)`, both scheduling on any `AudioContext`/`OfflineAudioContext` like existing cues. Not exported.

Sound design (must be told apart by ear and from the bell finale):
- Start: rising, urgent, short, buzzy square waves: 660 -> 880 -> 1320 Hz, ~0.5 s.
- End: falling, calm, soft sines: 784 -> 587 -> 392 Hz, ~0.7 s, decaying.
- Finale: existing double bell (metallic, ~2 s ring-out).

- [ ] **Step 1: Add the cue functions**

Insert after `playRestCue`:

```js
const BURST_START_NOTES = [
  { freq: 660, offset: 0, length: 0.1 },
  { freq: 880, offset: 0.11, length: 0.1 },
  { freq: 1320, offset: 0.22, length: 0.3 }
];

// Rising, buzzy square-wave triplet: urgent "go faster".
function playBurstStartCue(ctx, time) {
  const bus = masterBus(ctx);

  for (const note of BURST_START_NOTES) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const at = time + note.offset;

    osc.type = 'square';
    osc.frequency.value = note.freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.5, at + 0.005);
    gain.gain.setValueAtTime(0.5, at + note.length - 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + note.length);

    osc.connect(gain).connect(bus);
    osc.start(at);
    osc.stop(at + note.length + 0.02);
  }
}

const BURST_END_NOTES = [
  { freq: 784, offset: 0 },
  { freq: 587, offset: 0.18 },
  { freq: 392, offset: 0.36 }
];

// Falling, soft sine triplet that rings out: calm "ease off".
function playBurstEndCue(ctx, time) {
  const bus = masterBus(ctx);

  for (const note of BURST_END_NOTES) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const at = time + note.offset;

    osc.type = 'sine';
    osc.frequency.value = note.freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.6, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);

    osc.connect(gain).connect(bus);
    osc.start(at);
    osc.stop(at + 0.4);
  }
}
```

- [ ] **Step 2: Syntax check**

Run: `node --input-type=module --check < public/js/timer.js`
Expected: no output. (Audibility is checked in Task 7.)

- [ ] **Step 3: Stage**

```bash
git add public/js/timer.js
```

---

### Task 4: Timer integration

**Files:**
- Modify: `public/js/timer.js` (import at top; `WorkoutTimer` constructor, `totalDuration`, `buildSegments`, `render`, new method after `scheduleSegmentEndCues`, `loop`)

**Interfaces:**
- Consumes: `generateBurstSchedule`, `segmentsFromBursts` (Tasks 1-2); `playBurstStartCue`, `playBurstEndCue` (Task 3); existing `playBell`; workout `{ type: 'random', total_sec, min_rest_sec, burst_min_sec, burst_max_sec, name }`.
- Produces: `new WorkoutTimer(workout, onUpdate, onFinish, random = Math.random)`. For random workouts `onUpdate` emits `{ phase: 'work'|'rest', round, totalRounds: undefined, remainingPhase: number | null, remainingTotal }` with `remainingPhase === null` during rest. Existing types unchanged.

- [ ] **Step 1: Import**

Add below the header comment of `public/js/timer.js`:

```js
import { generateBurstSchedule, segmentsFromBursts } from './random-hiit.js';
```

- [ ] **Step 2: Constructor, totalDuration, buildSegments**

Change the constructor signature to `constructor(workout, onUpdate, onFinish, random = Math.random)` and add `this.random = random;` after `this.onFinish = onFinish;`.

First statement in `get totalDuration()`:

```js
    if (this.workout.type === 'random') {
      return this.workout.total_sec;
    }

```

First statement in `buildSegments()`:

```js
    if (this.workout.type === 'random') {
      const { total_sec, min_rest_sec, burst_min_sec, burst_max_sec } = this.workout;
      const bursts = generateBurstSchedule({
        totalSec: total_sec,
        minRestSec: min_rest_sec,
        burstMinSec: burst_min_sec,
        burstMaxSec: burst_max_sec,
        random: this.random
      });

      return segmentsFromBursts(bursts, total_sec, this.startTime);
    }

```

- [ ] **Step 3: Render branch**

In `render()` replace

```js
    playBell(offlineCtx, this.startTime);

    for (let i = 0; i < this.segments.length; i++) {
      this.scheduleSegmentEndCues(offlineCtx, i);
    }
```

with

```js
    if (this.workout.type === 'random') {
      this.scheduleRandomCues(offlineCtx);
    } else {
      playBell(offlineCtx, this.startTime);

      for (let i = 0; i < this.segments.length; i++) {
        this.scheduleSegmentEndCues(offlineCtx, i);
      }
    }
```

- [ ] **Step 4: Random cue method**

Add after `scheduleSegmentEndCues`:

```js
  scheduleRandomCues(ctx) {
    for (const segment of this.segments) {
      if (segment.kind === 'work') {
        playBurstStartCue(ctx, segment.start);
        playBurstEndCue(ctx, segment.end);
      }
    }

    const finish = this.segments[this.segments.length - 1].end;

    playBell(ctx, finish);
    playBell(ctx, finish + 0.34);
  }
```

The existing `RENDER_TAIL_SECONDS = 3` leaves room for the double bell's ring-out (about 2.5 s).

- [ ] **Step 5: Hide rest countdown in loop**

In `loop()`'s main `this.onUpdate({...})` (the one using `current`), replace `remainingPhase: current.end - nowTime,` with:

```js
        remainingPhase: this.workout.type === 'random' && current.kind === 'rest'
          ? null
          : current.end - nowTime,
```

- [ ] **Step 6: Syntax check**

Run: `node --input-type=module --check < public/js/timer.js`
Expected: no output.

- [ ] **Step 7: Stage**

```bash
git add public/js/timer.js
```

---

### Task 5: Form tab, fields, validation

**Files:**
- Modify: `public/index.html` (type picker, after intervals fields, rounds/lead labels, total line)
- Modify: `public/js/app.js` (form section)

**Interfaces:**
- Consumes: `maxBursts`, `validateRandomConfig` from `./random-hiit.js`; `openRunner(workout)` (existing).
- Produces: submit with `currentType === 'random'` calls `openRunner({ name, type: 'random', total_sec, min_rest_sec, burst_min_sec, burst_max_sec })` for guests and logged-in users alike.

- [ ] **Step 1: HTML**

Add a third tab after the Intervals button:

```html
        <button type="button" class="type-opt" data-type="random">Random HIIT</button>
```

Add after the `data-for="intervals"` div:

```html
        <div class="type-fields hidden" data-for="random">
          <label>Total minutes<input type="number" id="w-total-min" min="1" max="60" step="0.5" value="2"></label>
          <label>Minimum rest seconds<input type="number" id="w-min-rest" min="5" max="120" value="15"></label>
          <label>Shortest burst seconds<input type="number" id="w-burst-min" min="5" max="120" value="15"></label>
          <label>Longest burst seconds<input type="number" id="w-burst-max" min="5" max="120" value="30"></label>
          <p class="muted">Up to <span id="w-bursts">3</span> bursts</p>
        </div>
```

Add `data-except="random"` to the Rounds `<label>`, the Warning lead `<label>`, and the `<p class="muted">Total: ...</p>` line.

- [ ] **Step 2: app.js wiring**

At top: `import { maxBursts, validateRandomConfig } from './random-hiit.js';`

After the `restInput` declaration:

```js
const totalMinInput = byId('w-total-min');
const minRestInput = byId('w-min-rest');
const burstMinInput = byId('w-burst-min');
const burstMaxInput = byId('w-burst-max');

function randomConfig() {
  return {
    total_sec: Math.round(Number(totalMinInput.value) * 60),
    min_rest_sec: Number(minRestInput.value),
    burst_min_sec: Number(burstMinInput.value),
    burst_max_sec: Number(burstMaxInput.value)
  };
}

function randomEngineConfig(config) {
  return {
    totalSec: config.total_sec,
    minRestSec: config.min_rest_sec,
    burstMinSec: config.burst_min_sec,
    burstMaxSec: config.burst_max_sec
  };
}

function randomErrorMessage(code, config) {
  if (code === 'burst_range_invalid') {
    return 'Shortest burst must not exceed longest burst';
  }

  return `Total too short: need at least ${config.burst_min_sec + 2 * config.min_rest_sec}s`;
}
```

In `setType`, after the existing `.type-fields` loop add:

```js
  for (const element of document.querySelectorAll('[data-except]')) {
    element.classList.toggle('hidden', element.dataset.except === type);
  }

  byId('form-submit').textContent = loggedIn && type !== 'random' ? 'Save' : 'Start';
  byId('w-name').required = loggedIn && type !== 'random';
```

At the start of `updateFormDerived`:

```js
  const config = randomEngineConfig(randomConfig());

  byId('w-bursts').textContent = String(Math.max(0, maxBursts(config)));

```

Add `totalMinInput, minRestInput, burstMinInput, burstMaxInput` to the `for (const input of [...])` listener array. In `openForm` (before `setType(type)`), reset defaults:

```js
  totalMinInput.value = '2';
  minRestInput.value = '15';
  burstMinInput.value = '15';
  burstMaxInput.value = '30';
```

In the submit handler, immediately after `formError.textContent = '';`:

```js
  if (currentType === 'random') {
    const config = randomConfig();
    const code = validateRandomConfig(randomEngineConfig(config));

    if (code != null) {
      formError.textContent = randomErrorMessage(code, config);

      return;
    }

    openRunner({ name: byId('w-name').value.trim() || 'Workout', type: 'random', ...config });

    return;
  }
```

- [ ] **Step 3: Manual check**

Run `npm run dev`, open the app, click Random HIIT. Fields show; rounds/lead hidden; "Up to 3 bursts" for 2 min / 15 / 15 / 30. Set shortest 40, longest 20, press Start: `Shortest burst must not exceed longest burst`. Set total 0.5, shortest 15, longest 30: `Total too short: need at least 45s`. Switch back to EMOM: rounds/lead return and the submit label is correct.

- [ ] **Step 4: Stage**

```bash
git add public/index.html public/js/app.js
```

---

### Task 6: Runner display

**Files:**
- Modify: `public/js/app.js` (`workoutTotalSeconds`, `runnerHeading`, `openRunner`, `onRunUpdate`)

**Interfaces:**
- Consumes: `onUpdate` payload from Task 4; workout shape.

- [ ] **Step 1: Helpers**

`workoutTotalSeconds`: add first

```js
  if (workout.type === 'random') {
    return workout.total_sec;
  }

```

`runnerHeading`: replace the `typeLabel`/`summary` computation with:

```js
  const summary = workout.type === 'random'
    ? `Random HIIT · ${formatClock(workout.total_sec)} · bursts ${workout.burst_min_sec}-${workout.burst_max_sec}s`
    : `${workout.type === 'intervals' ? 'Intervals' : 'EMOM'} · ${workout.rounds} rounds`;
```

`openRunner`: replace `byId('run-time').textContent = formatClock(workout.work_sec);` with
`byId('run-time').textContent = formatClock(workout.type === 'random' ? workout.total_sec : workout.work_sec);` and replace the `run-rounds` line with:

```js
  byId('run-rounds').textContent = workout.type === 'random' ? 'Ready' : phaseLabel(workout, 'work', 1);
```

- [ ] **Step 2: onRunUpdate branch**

After `const workout = JSON.parse(startBtn.dataset.workout);` in `onRunUpdate` add:

```js
  if (workout.type === 'random') {
    renderRandomUpdate(state);

    return;
  }

```

and add above `onRunUpdate`:

```js
function renderRandomUpdate(state) {
  runnerSection.dataset.phase = state.phase;

  if (state.phase === 'rest') {
    byId('run-time').textContent = formatClock(state.remainingTotal);
    byId('run-rounds').textContent = 'REST';
    byId('run-total').textContent = '';

    return;
  }

  byId('run-time').textContent = formatClock(state.remainingPhase);
  byId('run-rounds').textContent = `GO · Burst ${state.round}`;
  byId('run-total').textContent = `Total remaining ${formatClock(state.remainingTotal)}`;
}
```

The Start handler builds a new `WorkoutTimer` per run, so each Start/Reset/Run again regenerates the schedule; no change needed.

- [ ] **Step 3: Stage**

```bash
git add public/js/app.js
```

---

### Task 7: Service worker, checks, manual verification

**Files:**
- Modify: `public/sw.js`

- [ ] **Step 1: Cache the new module**

Set `const CACHE = 'emom-shell-v6';` and add `'/js/random-hiit.js',` to `SHELL` after `'/js/timer.js',`.

- [ ] **Step 2: Automated checks**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass (typecheck/lint only cover `src/` and must stay green).

- [ ] **Step 3: Manual verification in a browser (real device if possible)**

Run `npm run dev`. With a short config (total 1 min, rest 5, burst 5-10):
1. Start: 3-2-1 beeps, then a REST screen counting total remaining. At a random time the rising buzzy start cue plays and the screen shows `GO · Burst 1` with a countdown; at its end the falling soft cue plays. Burst lengths differ between bursts. At the end the double bell rings.
2. The three sounds (start, end, finale) are clearly distinguishable by ear. No tic-toc or warning ring; no bell at time 0.
3. Pause/resume via tap and Space works; background the tab or lock the phone: cues still fire at the same moments.
4. Reset, then Start again: burst times and lengths differ from the previous run.
5. Logged in and as guest: Random HIIT shows `Start`, runs, does not save.
6. EMOM and Intervals run unchanged (regression, including the single bell at time 0).

- [ ] **Step 4: Stage and hand off**

```bash
git add public/sw.js
git status
```

Stop and tell the user the work is staged and ready for `/crit`. After their go-ahead, commit as `feat(random-hiit): add random burst workout mode` plus the attribution trailer.

---

## Self-review

- Spec coverage: random burst length with bounds, rest rule, count range, feasibility, validation codes (T1); segments (T2); three distinct cues (T3, T4); hidden timing UX (T4 step 5, T6); form fields, "Up to N bursts", errors, heading (T5, T6); SW (T7); tests incl. scripted RNG and seeded sweep (T1, T2); no backend.
- Signatures consistent: `generateBurstSchedule`, `maxBursts({ burstMinSec })`, `validateRandomConfig`, `segmentsFromBursts`, workout fields `total_sec`/`min_rest_sec`/`burst_min_sec`/`burst_max_sec`, cue names `playBurstStartCue`/`playBurstEndCue`.
- Scripted test values verified by hand: all-0 gives `[15-30, 45-60]`; all-0.999 gives count 3, extras 15 each, `free = 15`, scaled to 5 each, bursts `[15-35, 50-70, 85-105]`; `[0, .5, .5, .5, .5]` gives count 2, extras 8, slack 29, cuts 15, bursts `[30-53, 68-91]`.
