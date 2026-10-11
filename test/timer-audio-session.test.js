import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { WorkoutTimer } from '../public/js/timer.js';

const WORKOUT = { type: 'emom', name: 'Test', rounds: 2, work_sec: 40, rest_sec: 20, warning_lead_sec: 3 };

function fakeParam() {
  return new Proxy({}, { get: (target, key) => (key in target ? target[key] : () => {}), set: (target, key, value) => { target[key] = value; return true; } });
}

function fakeNode() {
  const node = new Proxy({}, {
    get: (target, key) => {
      if (key in target) {
        return target[key];
      }

      if (key === 'connect') {
        return (next) => next ?? node;
      }

      if (['gain', 'frequency', 'Q', 'threshold', 'knee', 'ratio', 'attack', 'release'].includes(key)) {
        return fakeParam();
      }

      return () => {};
    },
    set: (target, key, value) => { target[key] = value; return true; }
  });

  return node;
}

class FakeOfflineContext {
  constructor() {
    this.sampleRate = 22050;
    this.destination = fakeNode();
  }

  createBuffer() {
    return { getChannelData: () => new Float32Array(10) };
  }

  startRendering() {
    return new Promise(() => {});
  }
}

for (const name of ['createDynamicsCompressor', 'createGain', 'createBufferSource', 'createBiquadFilter', 'createOscillator']) {
  FakeOfflineContext.prototype[name] = () => fakeNode();
}

let live;

class FakeAudioContext {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.destination = {};
    this.log = [];
    this.sources = [];
    this.listeners = [];
    this.suspendGate = null;
    live = this;
  }

  addEventListener(type, listener) {
    this.listeners.push(listener);
  }

  fireStateChange(state) {
    this.state = state;

    for (const listener of this.listeners) {
      listener();
    }
  }

  resume() {
    this.state = 'running';
    this.log.push('resume');

    return Promise.resolve();
  }

  suspend() {
    this.log.push('suspend');

    if (this.suspendGate != null) {
      return this.suspendGate.then(() => {
        this.state = 'suspended';
      });
    }

    this.state = 'suspended';

    return Promise.resolve();
  }

  close() {
    this.log.push('close');

    return Promise.resolve();
  }

  createBufferSource() {
    const source = { connect: () => {}, start: () => this.log.push('source.start'), stop: () => this.log.push('source.stop') };
    this.sources.push(source);

    return source;
  }
}

describe('WorkoutTimer audio session', () => {
  const saved = {};
  let frames;
  let audioCreated;
  let handlers;
  let navigatorStub;

  beforeEach(() => {
    for (const key of ['navigator', 'Audio', 'OfflineAudioContext', 'AudioContext', 'requestAnimationFrame', 'cancelAnimationFrame']) {
      saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    }

    frames = [];
    audioCreated = 0;
    handlers = [];
    live = null;
    navigatorStub = {
      audioSession: { type: 'auto' },
      mediaSession: {
        setActionHandler: (action) => handlers.push(action),
        playbackState: 'none',
        metadata: null
      }
    };

    const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });

    define('navigator', navigatorStub);
    define('OfflineAudioContext', FakeOfflineContext);
    define('requestAnimationFrame', (callback) => frames.push(callback));
    define('cancelAnimationFrame', () => {});
    define('MediaMetadata', class {});
    define('AudioContext', FakeAudioContext);
    define('Audio', class {
      constructor() {
        audioCreated += 1;
        this.paused = true;
        this.currentTime = 0;
      }

      play() {
        this.paused = false;

        return Promise.resolve();
      }

      pause() {
        this.paused = true;
      }

      removeAttribute() {}
      load() {}
      addEventListener() {}
    });
    define('URL', Object.assign(function URLStub() {}, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }));
  });

  afterEach(() => {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete globalThis[key];
      }
    }

    delete globalThis.MediaMetadata;
  });

  function create(mix) {
    return new WorkoutTimer(WORKOUT, () => {}, () => {}, Math.random, mix);
  }

  describe('when mixing with music', () => {
    it('sets the ambient audio session', () => {
      const timer = create(true);
      timer.start();
      timer.stop();
      assert.equal(navigatorStub.audioSession.type, 'ambient');
    });

    it('does not install media session handlers', () => {
      const timer = create(true);
      timer.start();
      timer.installMediaSession();
      timer.stop();
      assert.deepEqual(handlers, []);
    });

    it('does not create an audio element', () => {
      const timer = create(true);
      timer.start();
      timer.stop();
      assert.equal(audioCreated, 0);
    });

    it('resumes a live audio context inside start', () => {
      const timer = create(true);
      timer.start();
      assert.deepEqual(live.log, ['resume']);
      timer.stop();
    });

    it('defaults to mixing', () => {
      const timer = new WorkoutTimer(WORKOUT, () => {}, () => {});
      timer.start();
      timer.stop();
      assert.equal(navigatorStub.audioSession.type, 'ambient');
    });
  });

  describe('when mixing is off', () => {
    it('sets the playback audio session', () => {
      const timer = create(false);
      timer.start();
      timer.stop();
      assert.equal(navigatorStub.audioSession.type, 'playback');
    });

    it('installs media session handlers', () => {
      const timer = create(false);
      timer.start();
      timer.installMediaSession();
      timer.stop();
      assert.ok(handlers.includes('play'));
    });

    it('plays through an audio element and no audio context', () => {
      const timer = create(false);
      timer.start();
      timer.stop();
      assert.equal(audioCreated, 1);
      assert.equal(live, null);
    });
  });

  describe('when mixing is requested but AudioContext is missing', () => {
    it('falls back to the playback session and media session', () => {
      delete globalThis.AudioContext;
      delete globalThis.webkitAudioContext;
      const timer = create(true);
      timer.start();
      timer.installMediaSession();
      timer.stop();
      assert.equal(navigatorStub.audioSession.type, 'playback');
      assert.equal(audioCreated, 1);
      assert.ok(handlers.includes('play'));
    });
  });

  describe('when the browser has no audioSession', () => {
    it('starts without throwing', () => {
      delete navigatorStub.audioSession;
      const timer = create(true);
      assert.doesNotThrow(() => timer.start());
      timer.stop();
    });
  });
});

describe('WorkoutTimer context clock', () => {
  const saved = {};
  let frames;
  let updates;

  beforeEach(() => {
    for (const key of ['navigator', 'OfflineAudioContext', 'AudioContext', 'requestAnimationFrame', 'cancelAnimationFrame']) {
      saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    }

    frames = [];
    updates = [];
    live = null;

    const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });

    class RenderingOffline extends FakeOfflineContext {
      startRendering() {
        return Promise.resolve({ length: 10 });
      }
    }

    define('navigator', {});
    define('OfflineAudioContext', RenderingOffline);
    define('AudioContext', FakeAudioContext);
    define('requestAnimationFrame', (callback) => frames.push(callback));
    define('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete globalThis[key];
      }
    }
  });

  async function startTimer() {
    const timer = new WorkoutTimer(WORKOUT, (state) => updates.push(state), () => {}, Math.random, true);
    timer.start();
    await new Promise((resolve) => setImmediate(resolve));

    return timer;
  }

  function lastUpdate() {
    const frame = frames.pop();
    frame();

    return updates[updates.length - 1];
  }

  describe('after the track starts', () => {
    it('starts the buffer source once', async () => {
      const timer = await startTimer();
      assert.equal(live.log.filter((entry) => entry === 'source.start').length, 1);
      timer.stop();
    });

    it('advances the displayed phase from the context clock', async () => {
      const timer = await startTimer();
      live.currentTime = 10;
      const update = lastUpdate();
      assert.equal(update.phase, 'work');
      assert.ok(update.remainingPhase < 40 && update.remainingPhase > 30);
      timer.stop();
    });
  });

  describe('when paused', () => {
    it('suspends the context and reports paused', async () => {
      const timer = await startTimer();
      timer.pause();
      assert.equal(timer.paused, true);
      assert.ok(live.log.includes('suspend'));
      timer.stop();
    });
  });

  describe('when resumed after a pause', () => {
    it('resumes the context and reports running', async () => {
      const timer = await startTimer();
      timer.pause();
      timer.resume();
      assert.equal(timer.paused, false);
      assert.equal(live.log.filter((entry) => entry === 'resume').length, 2);
      timer.stop();
    });
  });

  describe('when resumed before a slow suspend settles', () => {
    it('still calls resume on the context', async () => {
      const timer = await startTimer();
      let release;
      live.suspendGate = new Promise((resolve) => {
        release = resolve;
      });
      timer.pause();
      timer.resume();
      release();
      assert.equal(live.log.filter((entry) => entry === 'resume').length, 2);
      assert.equal(timer.paused, false);
      timer.stop();
    });
  });

  describe('when the OS suspends the context while running', () => {
    it('resumes the context', async () => {
      const timer = await startTimer();
      live.fireStateChange('interrupted');
      assert.equal(live.log.filter((entry) => entry === 'resume').length, 2);
      timer.stop();
    });
  });

  describe('when the context suspends because the user paused', () => {
    it('does not resume the context', async () => {
      const timer = await startTimer();
      timer.pause();
      live.fireStateChange('suspended');
      assert.equal(live.log.filter((entry) => entry === 'resume').length, 1);
      timer.stop();
    });
  });

  describe('when stopped', () => {
    it('stops the source and closes the context', async () => {
      const timer = await startTimer();
      timer.stop();
      assert.ok(live.log.includes('source.stop'));
      assert.ok(live.log.includes('close'));
    });
  });
});
