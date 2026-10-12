# Timer start lag - root cause and fix design

## Symptom

After tapping Start the countdown is frozen on "3" for a noticeable time, then the beeps and the 3-2-1 begin. Delay grows with workout length.

## Root cause

The entire workout is pre-rendered into one audio track before any audio plays, and the UI countdown clock is the audio clock, so nothing moves until the render finishes. (Confidence: high from code reading; not yet measured on device, plan task 1 adds timing marks.)

Evidence, all in `public/js/`:

- `app.js:599-600` - Start click calls `timer.start()` and nothing is awaited.
- `timer.js:336,361` (`start()`) - calls `this.render(this.playback)` fire-and-forget after `loop()`.
- `timer.js:399-424` (`render()`) - builds an `OfflineAudioContext` sized `startTime + totalDuration + 3s` at 22.05 kHz, schedules every cue of the whole workout (each bell = 4 partial oscillators + noise burst, each warning window = 2 ring bursts of 4 nodes + a tick-tock per second, per segment), then `await offlineCtx.startRendering()`. Cost is O(workout length x cue count); a 30+ min EMOM renders many thousands of nodes and ~40M samples.
- `timer.js:433` - only after that does `playback.begin(rendered, ...)` run, so the countdown beeps (scheduled at 0.15s, 1.15s, 2.15s inside the track) cannot start earlier than render completion.
- `playback.js:195-208` (`ContextPlayback.begin`) - `startedAt` is only set here; `position` returns 0 until then (`playback.js:187-189`).
- `timer.js:478-490` (`loop()` tick) - `elapsed = playback.position - startTime` = -3.15 while `position` is 0, so the UI sits on count 3 (`Math.ceil(3.15)` clamped to 3) for the whole render.
- Mixing-off path additionally pays `encodeWav` (`playback.js:24-65,107`): a per-sample JS loop on the main thread over the full track, a Blob copy, and `audio.load()` before `play()` (`playback.js:107-113`). Mixing-on path (`ContextPlayback`) skips this.
- `playback.js:79-86` (`prime`) and wake lock (`app.js:442-452`, `app.js:601`) are not on the critical path: prime is synchronous inside the click, and `acquireWakeLock()` is called after `timer.start()` returns and is not awaited by it.

## Regression origin

Commit `1c3f46c` scheduled cues in a sliding 4-segment window (cheap start). `6d6038b`/`69d18d2` replaced that with the full-track pre-render plus `<audio>` for background survival. `53123ff` kept the full render and added `ContextPlayback` on top, so the start cost was never removed.

## Design

Make time-to-first-beep independent of workout length by rendering in chunks and starting playback after only the first (short) chunk.

1. Render function takes a window `[from, to)` and schedules only cues whose start time falls in it, with times offset by `-from`. Buffer length = window + tail (3s, enough for the longest bell decay of 2.1s + stop margin).
2. Chunk 0 = countdown + first bell + a short lead (about 10s). It renders in tens of ms and playback starts immediately.
3. Remaining chunks render in the background, one per await (yielding to the event loop so rAF keeps running), each ahead of the playhead.
4. `ContextPlayback`: schedule every chunk as an `AudioBufferSourceNode` at `startedAt + from` on the context clock. Overlapping tails sum naturally; gapless, sample-accurate. `startedAt` is set when chunk 0 starts. The end-of-workout `onended` hooks the last chunk.
5. `ElementPlayback` (mixing off): `<audio>` cannot overlap or splice, so keep one WAV but also start fast: play a short head WAV (countdown + first bell) first, then swap `src` to the full WAV at the same `currentTime` once rendered. Swap is attempted while the head is silent; accept a possible tens-of-ms glitch. This is a second, separable step and may be deferred; the Android mixing path (the user's actual setup) gets the fix in step 4.
6. Guard: if a chunk is not ready when the playhead reaches its `from`, the cues are late rather than lost; log it. Chunks are far cheaper than playback so this should not occur.

Not changing: cue sounds, segment generation, media session behavior, wake lock, countdown length.

## Alternatives rejected

- Lower sample rate / simpler cues: reduces but does not remove O(length) cost; changes sound.
- Drive countdown UI off `performance.now()` instead of audio clock: hides the freeze but beeps would still arrive late and desync from the display.
- Web Worker for render/encode: `OfflineAudioContext` is not available in workers.

## Risks

- Chunk boundary cue clipping: a cue straddling a boundary must be rendered whole in the chunk that owns its start (tail handled by the buffer tail). Covered by a test.
- Random-HIIT workouts: segments are generated once in `start()` (random), so chunking must reuse `this.segments`, not regenerate.
- Pause/resume with scheduled future sources: `ctx.suspend()` freezes the context clock, so already-scheduled sources stay aligned. Needs a test.

## Scope

Frontend only (`public/js/timer.js`, `public/js/playback.js`, tests in `test/`). No backend change.
