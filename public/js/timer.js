// EMOM timer engine. All sounds are scheduled on the AudioContext clock so
// timing does not drift the way setTimeout would.

function scheduleTone(ctx, startTime, { freq, duration, peak, type }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

function scheduleTick(ctx, time) {
  scheduleTone(ctx, time, { freq: 880, duration: 0.07, peak: 0.25, type: 'square' });
}

function scheduleGong(ctx, time) {
  scheduleTone(ctx, time, { freq: 180, duration: 1.4, peak: 0.5, type: 'sine' });
  scheduleTone(ctx, time, { freq: 360, duration: 1.0, peak: 0.2, type: 'sine' });
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

    // Gong at the start of interval 1.
    scheduleGong(this.ctx, this.startTime);

    for (let k = 1; k <= this.intervals; k++) {
      const boundary = this.startTime + k * interval;

      for (let second = lead; second >= 1; second--) {
        scheduleTick(this.ctx, boundary - second);
      }

      scheduleGong(this.ctx, boundary);
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
