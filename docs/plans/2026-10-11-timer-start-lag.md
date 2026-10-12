# Timer start lag - implementation plan

Spec: `docs/specs/2026-10-11-timer-start-lag-design.md`. Frontend only. Tests: existing runner for `test/*.test.js` (see `package.json`); follow `test/timer-audio-session.test.js` style (nested `describe` per condition, short `it` titles). Commits: conventional commits. Stage, do not commit, until user reviews.

## Task 1 - measure (confirm root cause)

- In `WorkoutTimer.start/render` add temporary `performance.mark`/`measure` around: render schedule, `startRendering`, `encodeWav`, `begin`. Log durations for a 30 min EMOM and a 30 min random HIIT, mixing on and off.
- Expected: render dominates and scales with length. Remove the marks afterward (or keep behind a debug flag if cheap).
- Done when: numbers recorded in the PR description.

## Task 2 - windowed cue scheduling (pure, testable)

- Refactor `render()` cue scheduling in `public/js/timer.js` into `scheduleCues(ctx, from, to)` that emits only cues with start in `[from, to)`, offset by `-from`. Countdown beeps and the first bell belong to the window containing t=0.
- Tests first: with a fake ctx recording `(kind, time)`, assert (a) union of all windows equals the old full schedule, (b) no cue appears in two windows, (c) a cue exactly on a boundary lands in the later window, (d) random workouts use the existing `this.segments` and do not re-roll.
- Done when: tests pass and a single full window reproduces the previous schedule exactly.

## Task 3 - chunk renderer

- Add `renderChunk(from, to)` returning an `AudioBuffer` of length `(to - from + RENDER_TAIL_SECONDS)` using `OfflineAudioContext` at `RENDER_SAMPLE_RATE`.
- Add `CHUNK_SECONDS` (60) and `HEAD_SECONDS` (10) constants (numeric separators for 5+ digits).
- Tests: chunk buffer lengths, last chunk ends at `startTime + totalDuration + tail`.

## Task 4 - ContextPlayback chunk scheduling

- In `public/js/playback.js` add `ContextPlayback.begin(firstChunk, onEnded)` setting `startedAt` and starting chunk 0, plus `addChunk(buffer, from, isLast)` that starts a `BufferSourceNode` at `startedAt + from`. `onEnded` fires from the last chunk's source. `stop()` stops all sources.
- Tests (extend `test/timer-audio-session.test.js` fake ctx): chunk 0 starts immediately; later chunks start at `startedAt + from`; `onEnded` only from last; stop stops all; pause/resume keeps scheduled sources (suspend/resume called, no re-schedule).

## Task 5 - orchestrate in WorkoutTimer

- `render()` becomes: render head chunk, `await playback.begin(head, ...)`, then loop remaining chunks: `await` render, `playback.addChunk(...)`, `await` a macrotask (`setTimeout(0)`) between chunks so rAF is not starved. Honor `this.stopped` after every await.
- Verify manually: countdown starts counting within ~100 ms of tap on a 60 min workout, mixing on (Android Chrome with Spotify playing).

## Task 6 - element path head/swap (optional, separable)

- `ElementPlayback`: `begin(head)` plays short head WAV; `swapToFull(fullRendered)` sets `src`, restores `currentTime`, plays. Skip WAV encode of the full track until after the head is playing. Measure glitch on iOS Safari; if audible, defer or pick the swap point in a silent gap.
- Tests: head plays first; swap preserves `currentTime`; `stop()` mid-swap cleans up object URLs.

## Task 7 - regression checks

- Run full test suite and `eslint`.
- Manual: pause/resume mid-countdown and mid-workout, Reset during background render (no cues after stop, no leaked object URLs), random HIIT, mixing on/off, workout end triggers `onFinish` exactly once.

## Parallelism

Frontend-only; Tasks 2-5 are sequential in the same two files. Task 6 can follow independently after Task 5. No backend-builder work.
