# Play timer cues over the user's music - design

Status: DRAFT, awaiting user approval. Frontend-only.

## Problem

Starting any timer stops the user's phone music. User wants music and timer cues playing together.

## Platform

Not native. Installable PWA: vanilla JS in `public/js/`, Hono on Cloudflare Workers, `manifest.webmanifest` standalone. Cues are pre-rendered by `OfflineAudioContext` into one WAV and played through an `<audio>` element so they keep firing when backgrounded (`public/js/timer.js`, `WorkoutTimer.start/render`). Targets are iOS Safari/PWA and Android Chrome/PWA.

## Root cause

Commit 1e3d10e (`fix: claim audio focus...`) added to `WorkoutTimer`:

1. `navigator.audioSession.type = 'playback'` (Safari/iOS 16.4+ only). Playback is the non-mixable category, so iOS interrupts other apps' audio. This is the iOS cause of the music stopping.
2. `navigator.mediaSession` metadata, handlers, `playbackState`. Registers the page as a media player in the lock-screen and notification controls.

Even without the commit, an `<audio>` element playing a long WAV is treated as media playback. Android Chrome requests audio focus for media elements, and well-behaved music apps pause or duck. The commit made it deterministic on iOS and added the media-player identity on both platforms. The commit existed because, before it, music kept ownership and our cues were silenced in the background. That is the opposite failure of the same arbitration.

## What is achievable (web only)

| Platform | Mix with music | Duck music | Notes |
|---|---|---|---|
| iOS Safari/PWA | Yes: `audioSession.type = 'ambient'` (mixes, does not interrupt) | No. `duckOthers` is native-only | Ambient follows the silent switch, and likely does not keep playing with the screen locked or app backgrounded. Needs device check. |
| Android Chrome/PWA | Partly. Chrome takes audio focus for media elements, so music apps pause or duck on their own policy. Not controllable from web. | No | Fallback: render cues through a live `AudioContext` (no focus request) instead of `<audio>`. Works only while page is foreground or wake-lock held. Needs device check. |
| Native wrapper (Capacitor/Expo) | Yes, full control (`mixWithOthers`, `duckOthers`, `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`) | Yes | Out of scope. Big change; only if web results are unacceptable. |

Items marked "needs device check" are inferences from platform docs, not verified. Phase 0 of the plan verifies them on real devices before any code ships.

## Tradeoff vs the earlier fix

- Exclusive (`playback`): reliable cues, survives lock and background, kills music.
- Mixing: music and cues coexist; on iOS may lose cues when the screen locks or app backgrounds, and cues follow the silent switch.
- Mixing also removes the original failure: that bug was "music owns focus so cues are silenced". When both are allowed to play, nothing is silenced by arbitration.

## Options

A. Change default to mix, no setting. Simple, but silently regresses users who want lock-screen playback and no music.
B. Setting "Mix with my music", persisted in `localStorage`. Both behaviours kept; one new control.
C. Auto-detect. The web exposes no way to know if other audio is playing. Rejected.

## Recommendation: B, default ON

- User's stated need is mixing, and most people training have music on. Default ON serves them with no setup.
- Exclusive mode stays available for lock-screen or background-reliability users: OFF restores today's behaviour exactly.
- Cost is one toggle, one `localStorage` key, one branch in `WorkoutTimer.start()`. YAGNI: no ducking, no volume slider, no server storage (the setting is per-device by nature, and works for guests).
- Default ON is contingent on Phase 0: if iOS ambient drops cues on lock, flip the default to OFF and keep the toggle, or ship ON with an inline hint.

## Design

- New `public/js/audio-prefs.js`: `getMixWithMusic()` (default true, tolerant of missing or throwing `localStorage`) and `setMixWithMusic(value)`. Single place for the key `emom.mixWithMusic`.
- `WorkoutTimer` takes the preference at construction (`mixWithMusic`, injected by `app.js`; keeps the engine testable). In `start()`: mix on sets `audioSession.type = 'ambient'`; mix off sets `'playback'` (current). Skip the try-block if `audioSession` is absent.
- MediaSession: when mix is on, do not install metadata or handlers (so we do not present as the active player and compete with the music app's lock-screen controls); when off, install as today. `releaseMediaSession` becomes a no-op if never installed.
- Android fallback (only if Phase 0 shows Chrome pauses the music): in mix mode play the pre-rendered buffer via `AudioBufferSourceNode` on a live `AudioContext` instead of `<audio>`, with `currentTime` driven from the context clock. This changes the UI clock source in `loop()`, so it is a separate gated phase.
- UI: a checkbox "Play over my music" in the runner idle state near Start in `public/index.html`, wired in `public/js/app.js`. Disabled while running (applies at next Start). Hint text when on: "On iPhone, cues may stop if the screen locks."
- `public/sw.js`: bump cache `emom-shell-v7` -> `v8`.
- No backend, schema, or API change.

## Errors and edge cases

- `localStorage` blocked: default to ON in memory, no crash.
- `audioSession` unsupported (Android, older iOS): no-op; behaviour is whatever the browser does.
- Toggle changed mid-workout: ignored until next Start.

## Testing

- Unit (`node --test`, existing runner): `audio-prefs` default, round trip, throwing storage. `WorkoutTimer` start with a fake `navigator`: asserts `audioSession.type` for both modes and that MediaSession handlers are installed only when mix is off.
- Manual device matrix (the real acceptance): iOS Safari + installed PWA, Android Chrome + installed PWA, each with Spotify/Apple Music/YouTube Music playing, mix on and off: music continues, cues audible over it, behaviour on screen lock, behaviour on app background.

## Open questions

1. Is Android the user's phone, or iPhone? Decides how much of the fallback phase matters.
2. Accept that on iPhone cues may stop when the screen locks in mix mode? (Wake lock already keeps the screen on during a run, which may make this moot.)
3. Is true ducking (music quieter during cues) worth a native wrapper? Recommendation: no.
