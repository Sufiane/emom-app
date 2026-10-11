# Music mixing - implementation plan

Spec: `docs/specs/2026-10-11-music-mixing-design.md`. All work is frontend (`public/`). No backend. Commits use conventional-commit subjects.

## Phase 0 - device verification (no code, gates everything)

- [ ] On real iPhone and Android phone, temporarily set `audioSession.type = 'ambient'` (iOS) via a throwaway local build or Safari console on the deployed page. Record per case: music keeps playing? cues audible over music? cues survive screen lock? survive app background?
- [ ] Android: with the current `<audio>` path, does Spotify / YouTube Music pause or duck on Start? Record.
- [ ] Decide from results: default ON or OFF; whether Phase 4 (Android fallback) is needed. Report to coordinator before Phase 2 if iOS ambient drops cues on lock.

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

## Phase 4 - Android fallback (only if Phase 0 shows Chrome pauses music)

Re-plan after Phase 0; scope is rendering via `AudioBufferSourceNode` on a live `AudioContext` in mix mode and switching the `loop()` clock to the context time, with pause/resume via `ctx.suspend/resume`. Needs its own tests and a lock/background check. Skip if unnecessary.

## Independence

Frontend-only. Phases are sequential (1 -> 2 -> 3); no backend builder needed.
