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

let frames;
let updates;
const saved = {};

function define(name, value) {
  saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function restore() {
  for (const [name, descriptor] of Object.entries(saved)) {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      delete globalThis[name];
    }
  }
}

function runAt(workout, secondsIntoWorkout) {
  const timer = new WorkoutTimer(workout, (state) => updates.push(state), () => {}, Math.random, true);
  timer.prepareSchedule();
  timer.playback = { position: timer.startTime + secondsIntoWorkout };
  timer.loop();
  frames.pop()();

  return updates.at(-1);
}

describe('WorkoutTimer progress', () => {
  beforeEach(() => {
    frames = [];
    updates = [];
    define('requestAnimationFrame', (callback) => frames.push(callback));
    define('cancelAnimationFrame', () => {});
  });

  afterEach(restore);

  describe('when in the countdown', () => {
    it('is 0', () => {
      assert.equal(runAt(EMOM, -2).progress, 0);
    });
  });

  describe('when halfway through', () => {
    it('is the elapsed fraction of the total', () => {
      assert.equal(runAt(EMOM, 80).progress, 0.5);
    });
  });

  describe('when past the end', () => {
    it('is 1', () => {
      assert.equal(runAt(EMOM, 500).progress, 1);
    });
  });

  describe('when the workout is random', () => {
    it('uses total_sec', () => {
      assert.equal(runAt(RANDOM, 30).progress, 0.25);
    });
  });
});

describe('WorkoutTimer round counter', () => {
  beforeEach(() => {
    frames = [];
    updates = [];
    define('requestAnimationFrame', (callback) => frames.push(callback));
    define('cancelAnimationFrame', () => {});
  });

  afterEach(restore);

  describe('when in the last work period', () => {
    it('reports the final round of the total', () => {
      const state = runAt(EMOM, 150);
      assert.equal(state.phase, 'work');
      assert.equal(state.round, 3);
      assert.equal(state.totalRounds, 3);
    });
  });

  describe('when the workout has finished', () => {
    it('stays on the final work round', () => {
      const state = runAt(EMOM, 500);
      assert.equal(state.phase, 'work');
      assert.equal(state.round, 3);
    });
  });

  describe('when resting before the last round', () => {
    it('reports the round just completed', () => {
      const state = runAt(EMOM, 100);
      assert.equal(state.phase, 'rest');
      assert.equal(state.round, 2);
    });
  });
});
