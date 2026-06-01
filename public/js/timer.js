// EMOM timer engine. All sounds are synthesized and scheduled on the
// AudioContext clock so timing does not drift the way setTimeout would.

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

const COUNTDOWN_SECONDS = 3;

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

export class WorkoutTimer {
  constructor(workout, onUpdate, onFinish) {
    this.workout = workout;
    this.onUpdate = onUpdate;
    this.onFinish = onFinish;
    this.ctx = null;
    this.startTime = 0;
    this.rafId = 0;
    this.finished = false;
    this.segments = [];
  }

  get totalDuration() {
    const { rounds, work_sec, rest_sec } = this.workout;

    return rounds * (work_sec + rest_sec);
  }

  buildSegments() {
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
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    const now = this.ctx.currentTime;
    this.startTime = now + COUNTDOWN_SECONDS + 0.15;
    this.finished = false;
    this.segments = this.buildSegments();

    for (let n = 0; n < COUNTDOWN_SECONDS; n++) {
      playCountBeep(this.ctx, now + 0.15 + n);
    }

    this.scheduleAll();
    this.loop();
  }

  scheduleAll() {
    const lead = this.workout.warning_lead_sec;
    const segments = this.segments;

    // Bell at the very first work-phase start.
    playBell(this.ctx, this.startTime);

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];

      // Warning window before this phase ends.
      playWarningCue(this.ctx, seg.end - lead);

      for (let second = lead; second >= 1; second--) {
        playTickTock(this.ctx, seg.end - second, second % 2 === 0);
      }

      const next = segments[i + 1];

      if (next == null) {
        // Final boundary — boxing "ding-ding" finish.
        playBell(this.ctx, seg.end);
        playBell(this.ctx, seg.end + 0.34);
      } else if (next.kind === 'work') {
        playBell(this.ctx, seg.end);
      } else {
        playRestCue(this.ctx, seg.end);
      }
    }
  }

  loop() {
    const tick = () => {
      const elapsed = this.ctx.currentTime - this.startTime;
      const total = this.totalDuration;

      // Pre-roll "get ready" countdown before the first phase.
      if (elapsed < 0) {
        this.onUpdate({ phase: 'countdown', count: Math.ceil(-elapsed) });
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

      const nowTime = this.ctx.currentTime;
      let current = this.segments[this.segments.length - 1];

      for (const seg of this.segments) {
        if (nowTime < seg.end) {
          current = seg;
          break;
        }
      }

      this.onUpdate({
        phase: current.kind,
        round: current.round,
        totalRounds: this.workout.rounds,
        remainingPhase: current.end - nowTime,
        remainingTotal: total - elapsed
      });

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  pause() {
    if (this.ctx != null && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
  }

  resume() {
    if (this.ctx != null && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  get paused() {
    return this.ctx != null && this.ctx.state === 'suspended';
  }

  finish() {
    cancelAnimationFrame(this.rafId);

    if (!this.finished) {
      this.finished = true;
      this.onFinish();
    }
  }

  stop() {
    cancelAnimationFrame(this.rafId);

    if (this.ctx != null) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
