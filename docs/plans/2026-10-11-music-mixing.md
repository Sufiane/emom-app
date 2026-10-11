# Music mixing - implementation plan

Spec: `docs/specs/2026-10-11-music-mixing-design.md`. All work is frontend (`public/`). No backend. Commits use conventional-commit subjects.

## Phase 0 - device verification (post-build, user)

User is on Android, keeps the app in the foreground. No pre-build gate: AudioContext requests no audio focus, so build it directly and verify on device after. Check: Spotify/YouTube keep playing on Start, cues audible over music, pause/resume works.

## Phase 1 - preference module

1. [ ] Test first: `test/audio-prefs.test.js` - default true; set false then get false; storage that throws returns true and does not throw on set.
2. [ ] `public/js/audio-prefs.js`: `getMixWithMusic()`, `setMixWithMusic(value)`, key `emom.mixWithMusic`.
   Commit: `feat(audio): add mix-with-music preference`

## Phase 2 - timer engine

1. [ ] Test first: `test/timer-audio-session.test.js` with a stubbed `globalThis.navigator` and `Audio`: mix on -> `audioSession.type === 'ambient'`, no `setActionHandler` calls; mix off -> `'playback'` and handlers installed. (Constructor takes the flag; assert via `start()` without waiting for render.)
2. [ ] `public/js/timer.js`: add `mixWithMusic` constructor param (default true); branch in `start()`; guard `installMediaSession` on `!mixWithMusic`; keep `releaseMediaSession` safe when never installed.
   Commit: `feat(timer): let cues mix with background music`

## Phase 3 - UI

1. [ ] `public/index.html`: "Play over my music" checkbox plus hint in the runner idle area.
2. [ ] `public/js/app.js`: init checkbox from `getMixWithMusic()`, persist on change, pass value into `new WorkoutTimer(...)` at the start-button handler, disable while state is running or paused.
3. [ ] `public/sw.js`: `emom-shell-v7` -> `emom-shell-v8`.
4. [ ] `npm test && npm run typecheck && npm run lint`.
5. [ ] Manual device matrix from the spec (hand to user or `qa-verifier`).
   Commit: `feat(runner): add play-over-music toggle`

## Phase 4 - Android AudioContext path (REQUIRED, user is on Android, foreground use)

Do after Phase 2, before UI. In mix mode, play the pre-rendered buffer via `AudioBufferSourceNode` on a live `AudioContext` instead of the `<audio>` element (no audio-focus request). Drive `loop()` clock from `ctx.currentTime`; pause/resume via `ctx.suspend/resume`; resume ctx inside the Start user gesture. Keep the `<audio>` path for mix OFF. Tests: fake AudioContext, assert no `<audio>` play in mix mode, clock advances, pause/resume. Foreground use is the supported case; wake lock stays.

## Independence

Frontend-only. Phases are sequential (1 -> 2 -> 3); no backend builder needed.
