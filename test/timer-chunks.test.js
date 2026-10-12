import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { WorkoutTimer } from '../public/js/timer.js';

const EMOM = { type: 'emom', name: 'Test', rounds: 3, work_sec: 40, rest_sec: 20, warning_lead_sec: 3 };
const RANDOM = {
  type: 'random',
  name: 'Random',
  total_sec: 120,
  min_rest_sec: 5,
  burst_min_sec: 5,
  burst_max_sec: 10,
  warning_lead_sec: 3
};

function timerFor(workout, random = Math.random) {
  const timer = new WorkoutTimer(workout, () => {}, () => {}, random, true);
  timer.prepareSchedule();

  return timer;
}

function windowsCues(timer) {
  return timer.chunkWindows().map((span) => timer.cuesInWindow(span.from, span.to));
}

describe('WorkoutTimer cue windows', () => {
  describe('when one window spans the whole track', () => {
    it('returns every cue', () => {
      const timer = timerFor(EMOM);
      assert.deepEqual(timer.cuesInWindow(0, Infinity), timer.cues);
    });
  });

  describe('when the track is split into chunk windows', () => {
    it('covers every cue exactly once', () => {
      const timer = timerFor(EMOM);
      const windowed = windowsCues(timer).flat();
      const closing = timer.cues.filter((cue) => cue.time >= timer.trackEnd);
      assert.equal(windowed.length + closing.length, timer.cues.length);
      assert.equal(new Set(windowed).size, windowed.length);
    });
  });

  describe('when a cue sits exactly on a window boundary', () => {
    it('lands in the later window', () => {
      const timer = timerFor(EMOM);
      timer.cues = [{ kind: 'bell', time: 10 }];
      assert.equal(timer.cuesInWindow(0, 10).length, 0);
      assert.equal(timer.cuesInWindow(10, 70).length, 1);
    });
  });

  describe('when the workout is random', () => {
    it('reuses the generated segments', () => {
      const timer = timerFor(RANDOM);
      const segments = timer.segments;
      const before = timer.cues.map((cue) => cue.time);
      windowsCues(timer);
      timer.scheduleCues(new FakeOffline({ length: 1, sampleRate: 22_050 }), 0, Infinity);
      assert.equal(timer.segments, segments);
      assert.deepEqual(timer.cues.map((cue) => cue.time), before);
    });

    it('leaves only the two closing bells past the track end', () => {
      const timer = timerFor(RANDOM);
      const closing = timer.cues.filter((cue) => cue.time >= timer.trackEnd);
      assert.deepEqual(closing.map((cue) => cue.kind), ['bell', 'bell']);
    });
  });
});

describe('WorkoutTimer chunk windows', () => {
  describe('when the workout is longer than the head', () => {
    it('starts with a head window then fixed-size chunks', () => {
      const windows = timerFor(EMOM).chunkWindows();
      assert.deepEqual(windows[0], { from: 0, to: 10 });
      assert.deepEqual(windows[1], { from: 10, to: 70 });
    });

    it('ends at the track end', () => {
      const timer = timerFor(EMOM);
      assert.equal(timer.chunkWindows().pop().to, timer.trackEnd);
    });
  });
});

let created = [];

class FakeOffline {
  constructor(options) {
    this.options = options;
    this.sampleRate = options.sampleRate;
    this.destination = {};
    created.push(this);
  }

  startRendering() {
    return Promise.resolve({ length: this.options.length });
  }
}

function anything() {
  const node = new Proxy(function node() {}, {
    get: () => node,
    set: () => true,
    apply: () => node
  });

  return node;
}

for (const name of ['createDynamicsCompressor', 'createGain', 'createBufferSource', 'createBiquadFilter', 'createOscillator']) {
  FakeOffline.prototype[name] = anything;
}

FakeOffline.prototype.createBuffer = () => ({ getChannelData: () => new Float32Array(10) });

describe('WorkoutTimer renderChunk', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'OfflineAudioContext');

  beforeEach(() => {
    created = [];
    Object.defineProperty(globalThis, 'OfflineAudioContext', { value: FakeOffline, configurable: true, writable: true });
  });

  afterEach(() => {
    if (saved) {
      Object.defineProperty(globalThis, 'OfflineAudioContext', saved);
    } else {
      delete globalThis.OfflineAudioContext;
    }
  });

  describe('when rendering a mid-track chunk', () => {
    it('sizes the buffer to the window plus the tail', async () => {
      const timer = timerFor(EMOM);
      await timer.renderChunk(10, 70);
      assert.equal(created[0].options.length, (60 + 3) * 22_050);
    });
  });

  describe('when rendering the last chunk', () => {
    it('ends the buffer at the track end plus the tail', async () => {
      const timer = timerFor(EMOM);
      const { from, to } = timer.chunkWindows().pop();
      await timer.renderChunk(from, to);
      const endSeconds = from + created[0].options.length / 22_050;
      assert.ok(Math.abs(endSeconds - (timer.trackEnd + 3)) < 1 / 22_050);
    });
  });
});
