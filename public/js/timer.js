// EMOM timer engine. All sounds are synthesized and scheduled on the
// AudioContext clock so timing does not drift the way setTimeout would.

// Boxing ring bell: bright metallic strike built from inharmonic partials
// (bell-like ratios) with a fast attack and long ring-out.
const BELL_FUNDAMENTAL = 560;
const BELL_PARTIALS = [
  { ratio: 1.0, peak: 0.5, decay: 1.9 },
  { ratio: 2.76, peak: 0.3, decay: 1.5 },
  { ratio: 5.4, peak: 0.18, decay: 0.9 },
  { ratio: 8.93, peak: 0.1, decay: 0.6 }
];

function playBell(ctx, time) {
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

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

const noiseBuffers = new WeakMap();

function noiseBuffer(ctx) {
  let buffer = noiseBuffers.get(ctx);

  if (buffer == null) {
    const length = Math.floor(ctx.sampleRate * 0.1);
    buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    noiseBuffers.set(ctx, buffer);
  }

  return buffer;
}

// Wooden clapper "clack" — a short filtered-noise burst, like the warning
// clappers struck before the end of a boxing round.
function playClack(ctx, time) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);

  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2100;
  band.Q.value = 1.4;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.6, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);

  source.connect(band).connect(gain).connect(ctx.destination);
  source.start(time);
  source.stop(time + 0.08);
}

export class EmomTimer {
  constructor(workout, onUpdate, onFinish) {
    this.workout = workout;
    this.onUpdate = onUpdate;
    this.onFinish = onFinish;
    this.ctx = null;
    this.startTime = 0;
    this.rafId = 0;
    this.finished = false;
  }

  get intervals() {
    return this.workout.total_duration_sec / this.workout.interval_sec;
  }

  start() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.startTime = this.ctx.currentTime + 0.15;
    this.finished = false;

    this.scheduleAll();
    this.loop();
  }

  scheduleAll() {
    const { interval_sec: interval, warning_lead_sec: lead } = this.workout;

    // Bell at the start of interval 1.
    playBell(this.ctx, this.startTime);

    for (let k = 1; k <= this.intervals; k++) {
      const boundary = this.startTime + k * interval;

      for (let second = lead; second >= 1; second--) {
        playClack(this.ctx, boundary - second);
      }

      playBell(this.ctx, boundary);

      // Final boundary gets a second strike — a boxing "ding-ding" finish.
      if (k === this.intervals) {
        playBell(this.ctx, boundary + 0.34);
      }
    }
  }

  loop() {
    const tick = () => {
      const elapsed = this.ctx.currentTime - this.startTime;
      const total = this.workout.total_duration_sec;

      if (elapsed >= total) {
        this.onUpdate({ elapsed: total, remainingTotal: 0, currentInterval: this.intervals, remainingInterval: 0 });
        this.finish();

        return;
      }

      const clamped = Math.max(0, elapsed);
      const currentInterval = Math.floor(clamped / this.workout.interval_sec) + 1;
      const remainingInterval = this.workout.interval_sec - (clamped % this.workout.interval_sec);

      this.onUpdate({
        elapsed: clamped,
        remainingTotal: total - clamped,
        currentInterval: Math.min(currentInterval, this.intervals),
        remainingInterval
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
