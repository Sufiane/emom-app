// EMOM timer engine. The workout's cue timeline is rendered up front
// into a single audio track (see playback.js for how it is played). With
// mixing off it plays through an <audio> element so cues keep firing when
// backgrounded; with mixing on it plays on a live AudioContext so the
// user's music app is not interrupted.

import { createPlayback } from './playback.js';
import { generateBurstSchedule, segmentsFromBursts } from './random-hiit.js';

// Shared output bus: a brick-wall-ish limiter so everything can be driven
// loud and punchy without harsh clipping at the destination.
const busNodes = new WeakMap();

function masterBus(ctx) {
  let bus = busNodes.get(ctx);

  if (bus == null) {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.18;

    const makeup = ctx.createGain();
    makeup.gain.value = 1.6;

    limiter.connect(makeup).connect(ctx.destination);
    bus = limiter;
    busNodes.set(ctx, bus);
  }

  return bus;
}

const noiseBuffers = new WeakMap();

function noiseBuffer(ctx) {
  let buffer = noiseBuffers.get(ctx);

  if (buffer == null) {
    const length = Math.floor(ctx.sampleRate * 0.15);
    buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    noiseBuffers.set(ctx, buffer);
  }

  return buffer;
}

// Boxing ring bell: bright metallic strike built from inharmonic partials
// (bell-like ratios) with a fast attack and long ring-out, plus a noisy
// transient at the moment of impact for punch.
const BELL_FUNDAMENTAL = 560;
const BELL_PARTIALS = [
  { ratio: 1.0, peak: 1.0, decay: 2.1 },
  { ratio: 2.76, peak: 0.7, decay: 1.6 },
  { ratio: 5.4, peak: 0.45, decay: 1.0 },
  { ratio: 8.93, peak: 0.28, decay: 0.7 }
];

function playStrike(ctx, time, destination) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);

  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 3200;
  band.Q.value = 0.8;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.9, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);

  source.connect(band).connect(gain).connect(destination);
  source.start(time);
  source.stop(time + 0.05);
}

function playBell(ctx, time) {
  const bus = masterBus(ctx);
  const master = ctx.createGain();
  master.gain.value = 1.0;
  master.connect(bus);

  playStrike(ctx, time, master);

  for (const partial of BELL_PARTIALS) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = BELL_FUNDAMENTAL * partial.ratio;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(partial.peak, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + partial.decay);

    osc.connect(gain).connect(master);
    osc.start(time);
    osc.stop(time + partial.decay + 0.1);
  }
}

// A single bell "ring" — a metallic tone chopped by a fast tremolo to
// give the trilling "brrring" of an old telephone / alarm bell.
function ringBurst(ctx, time, duration) {
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(0.95, time + 0.01);
  env.gain.setValueAtTime(0.95, time + duration - 0.04);
  env.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  env.connect(masterBus(ctx));

  // Tremolo: a square LFO chops the tone on/off for the trill.
  const tremolo = ctx.createGain();
  tremolo.gain.value = 0.5;
  tremolo.connect(env);

  const lfo = ctx.createOscillator();
  const lfoDepth = ctx.createGain();
  lfo.type = 'square';
  lfo.frequency.value = 28;
  lfoDepth.gain.value = 0.5;
  lfo.connect(lfoDepth).connect(tremolo.gain);
  lfo.start(time);
  lfo.stop(time + duration);

  for (const freq of [1050, 1560]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(tremolo);
    osc.start(time);
    osc.stop(time + duration);
  }
}

// Distinct cue when the warning window opens: a "ring ring".
function playWarningCue(ctx, time) {
  ringBurst(ctx, time, 0.32);
  ringBurst(ctx, time + 0.42, 0.32);
}

// Short beep for each "get ready" count before the workout begins.
function playCountBeep(ctx, time) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.value = 700;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.7, time + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);

  osc.connect(gain).connect(masterBus(ctx));
  osc.start(time);
  osc.stop(time + 0.22);
}

// Mellow descending two-tone marking the start of a rest phase — clearly
// softer and lower than the bright work bell.
function playRestCue(ctx, time) {
  const bus = masterBus(ctx);
  const notes = [{ freq: 440, offset: 0 }, { freq: 300, offset: 0.16 }];

  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const at = time + note.offset;

    osc.type = 'sine';
    osc.frequency.value = note.freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.7, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);

    osc.connect(gain).connect(bus);
    osc.start(at);
    osc.stop(at + 0.22);
  }
}

const BURST_START_NOTES = [
  { freq: 660, offset: 0, length: 0.1 },
  { freq: 880, offset: 0.11, length: 0.1 },
  { freq: 1320, offset: 0.22, length: 0.3 }
];

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

// Clock "tic"/"toc" — a sharp noise click plus a short pitched body. The
// high pitch is the "tic", the low pitch the "toc"; they alternate each
// second during the warning window.
function playTickTock(ctx, time, high) {
  const bus = masterBus(ctx);

  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = high ? 3500 : 2200;

  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(1.1, time);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);

  source.connect(highpass).connect(clickGain).connect(bus);
  source.start(time);
  source.stop(time + 0.04);

  const osc = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = high ? 1900 : 1250;
  bodyGain.gain.setValueAtTime(0.0001, time);
  bodyGain.gain.exponentialRampToValueAtTime(0.8, time + 0.003);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);

  osc.connect(bodyGain).connect(bus);
  osc.start(time);
  osc.stop(time + 0.06);
}

const RENDER_SAMPLE_RATE = 22050;
const COUNTDOWN_SECONDS = 3;
const PREROLL_LEAD = 0.15;
const RENDER_TAIL_SECONDS = 3;

export class WorkoutTimer {
  constructor(workout, onUpdate, onFinish, random = Math.random, mixWithMusic = true) {
    this.workout = workout;
    this.mixing = mixWithMusic;
    this.onUpdate = onUpdate;
    this.onFinish = onFinish;
    this.random = random;
    this.playback = null;
    this.startTime = 0;
    this.rafId = 0;
    this.finished = false;
    this.stopped = false;
    this.segments = [];
  }

  get totalDuration() {
    if (this.workout.type === 'random') {
      return this.workout.total_sec;
    }

    const { rounds, work_sec, rest_sec } = this.workout;

    return rounds * (work_sec + rest_sec);
  }

  buildSegments() {
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

    const { rounds, work_sec, rest_sec } = this.workout;
    const segments = [];
    let cursor = this.startTime;

    for (let round = 1; round <= rounds; round++) {
      segments.push({ kind: 'work', round, start: cursor, end: cursor + work_sec });
      cursor += work_sec;

      if (rest_sec > 0) {
        segments.push({ kind: 'rest', round, start: cursor, end: cursor + rest_sec });
        cursor += rest_sec;
      }
    }

    return segments;
  }

  start() {
    this.playback = createPlayback(this.mixing);
    this.mixing = this.playback.mixes;
    this.playback.prime();

    // Ambient mixes with other apps' audio; playback claims audio focus so
    // cues survive backgrounding but interrupt the user's music. Safari
    // 16.4+ / iOS 16.4+ only; other browsers ignore it.
    if ('audioSession' in navigator) {
      try {
        navigator.audioSession.type = this.mixing ? 'ambient' : 'playback';
      } catch {
        // The property exists but the value was rejected; nothing to do.
      }
    }

    this.startTime = COUNTDOWN_SECONDS + PREROLL_LEAD;
    this.finished = false;
    this.stopped = false;
    this.segments = this.buildSegments();

    // Kick the visual loop right away so the countdown UI updates while
    // the workout track finishes rendering in the background.
    this.loop();

    this.render(this.playback);
  }

  installMediaSession() {
    if (this.mixing || !('mediaSession' in navigator)) {
      return;
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.workout.name || 'Workout',
        artist: 'EMOM'
      });
      navigator.mediaSession.setActionHandler('play', () => this.resume());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('stop', () => this.pause());
      navigator.mediaSession.playbackState = 'playing';
    } catch {
      // Older browsers reject some action types; not critical.
    }
  }

  releaseMediaSession() {
    if (this.mixing || !('mediaSession' in navigator)) {
      return;
    }

    try {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('stop', null);
    } catch {
      // Ignore.
    }
  }

  async render(playback) {
    const trackSeconds = this.startTime + this.totalDuration + RENDER_TAIL_SECONDS;
    const offlineCtx = new OfflineAudioContext({
      numberOfChannels: 1,
      length: Math.ceil(trackSeconds * RENDER_SAMPLE_RATE),
      sampleRate: RENDER_SAMPLE_RATE
    });

    for (let n = 0; n < COUNTDOWN_SECONDS; n++) {
      playCountBeep(offlineCtx, PREROLL_LEAD + n);
    }

    if (this.workout.type === 'random') {
      this.scheduleRandomCues(offlineCtx);
    } else {
      playBell(offlineCtx, this.startTime);

      for (let i = 0; i < this.segments.length; i++) {
        this.scheduleSegmentEndCues(offlineCtx, i);
      }
    }

    let rendered;

    try {
      rendered = await offlineCtx.startRendering();
    } catch {
      return;
    }

    if (this.stopped) {
      return;
    }

    const started = await playback.begin(rendered, () => this.finish());

    // Register as a media player so the OS does not treat our cues as
    // ambient sound that other apps can preempt. Skipped when mixing.
    if (started && !this.stopped) {
      this.installMediaSession();
    }
  }

  scheduleSegmentEndCues(ctx, index) {
    const lead = this.workout.warning_lead_sec;
    const seg = this.segments[index];

    playWarningCue(ctx, seg.end - lead);

    for (let second = lead; second >= 1; second--) {
      playTickTock(ctx, seg.end - second, second % 2 === 0);
    }

    const next = this.segments[index + 1];

    if (next == null) {
      playBell(ctx, seg.end);
      playBell(ctx, seg.end + 0.34);
    } else if (next.kind === 'work') {
      playBell(ctx, seg.end);
    } else {
      playRestCue(ctx, seg.end);
    }
  }

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

  loop() {
    const tick = () => {
      if (this.playback == null || this.stopped) {
        return;
      }

      const elapsed = this.playback.position - this.startTime;
      const total = this.totalDuration;

      // Pre-roll "get ready" countdown before the first phase.
      if (elapsed < 0) {
        const remaining = Math.max(1, Math.ceil(-elapsed));

        this.onUpdate({ phase: 'countdown', count: Math.min(COUNTDOWN_SECONDS, remaining) });
        this.rafId = requestAnimationFrame(tick);

        return;
      }

      if (elapsed >= total) {
        const last = this.segments[this.segments.length - 1];

        this.onUpdate({
          phase: last.kind,
          round: last.round,
          totalRounds: this.workout.rounds,
          remainingPhase: 0,
          remainingTotal: 0
        });
        this.finish();

        return;
      }

      const nowTime = this.playback.position;
      let current = this.segments[this.segments.length - 1];

      for (let i = 0; i < this.segments.length; i++) {
        if (nowTime < this.segments[i].end) {
          current = this.segments[i];
          break;
        }
      }

      this.onUpdate({
        phase: current.kind,
        round: current.round,
        totalRounds: this.workout.rounds,
        remainingPhase: this.workout.type === 'random' && current.kind === 'rest'
          ? null
          : current.end - nowTime,
        remainingTotal: total - elapsed
      });

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  pause() {
    if (this.playback != null) {
      this.playback.pause();
    }

    this.setPlaybackState('paused');
  }

  resume() {
    if (this.playback != null && !this.finished) {
      this.playback.resume();
    }

    this.setPlaybackState('playing');
  }

  setPlaybackState(state) {
    if (this.mixing || !('mediaSession' in navigator)) {
      return;
    }

    try {
      navigator.mediaSession.playbackState = state;
    } catch {
      // Ignore.
    }
  }

  get paused() {
    return this.playback != null && this.playback.paused;
  }

  finish() {
    cancelAnimationFrame(this.rafId);

    if (!this.finished) {
      this.finished = true;
      this.onFinish();
    }
  }

  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.rafId);

    if (this.playback != null) {
      this.playback.stop();
      this.playback = null;
    }

    this.releaseMediaSession();
  }
}
