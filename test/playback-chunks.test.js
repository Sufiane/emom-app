import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ContextPlayback, ElementPlayback } from '../public/js/playback.js';

class FakeContext {
  constructor() {
    this.currentTime = 0;
    this.destination = {};
    this.sources = [];
  }

  createBufferSource() {
    const source = {
      stopped: false,
      connect: () => {},
      start: (when, offset) => {
        source.when = when;
        source.offset = offset;
      },
      stop: () => {
        source.stopped = true;
      }
    };
    this.sources.push(source);

    return source;
  }

  suspend() {
    return Promise.resolve();
  }

  resume() {
    return Promise.resolve();
  }

  close() {
    return Promise.resolve();
  }
}

describe('ContextPlayback chunks', () => {
  let playback;
  let ended;

  beforeEach(() => {
    playback = new ContextPlayback(FakeContext);
    ended = 0;
  });

  describe('when the first chunk begins', () => {
    it('starts it immediately and anchors the clock', async () => {
      playback.ctx.currentTime = 5;
      await playback.begin({}, () => {}, { isLast: false });
      assert.equal(playback.ctx.sources[0].when, 5);
      assert.equal(playback.startedAt, 5);
    });
  });

  describe('when later chunks are added', () => {
    it('starts each at the anchor plus its offset', async () => {
      playback.ctx.currentTime = 5;
      await playback.begin({}, () => {}, { isLast: false });
      await playback.addChunk({}, 10, false);
      await playback.addChunk({}, 70, true);
      assert.deepEqual(playback.ctx.sources.map((source) => source.when), [5, 15, 75]);
    });
  });

  describe('when sources end', () => {
    beforeEach(async () => {
      await playback.begin({}, () => {
        ended += 1;
      }, { isLast: false });
      await playback.addChunk({}, 10, true);
    });

    it('ignores a non-last source', () => {
      playback.ctx.sources[0].onended();
      assert.equal(ended, 0);
    });

    it('notifies from the last source', () => {
      playback.ctx.sources[1].onended();
      assert.equal(ended, 1);
    });

    it('drops the ended source', () => {
      playback.ctx.sources[0].onended();
      assert.equal(playback.sources.length, 1);
    });
  });

  describe('when a chunk arrives after its start time', () => {
    let warnings;
    let original;

    beforeEach(async () => {
      warnings = [];
      original = console.warn;
      console.warn = (message) => warnings.push(message);
      await playback.begin({}, () => {
        ended += 1;
      }, { isLast: false });
      playback.ctx.currentTime = 12;
    });

    afterEach(() => {
      console.warn = original;
    });

    it('warns about the late chunk', async () => {
      await playback.addChunk({ duration: 63 }, 10, false);
      assert.equal(warnings.length, 1);
    });

    it('starts now at the offset that keeps cues on time', async () => {
      await playback.addChunk({ duration: 63 }, 10, false);
      const late = playback.ctx.sources[1];
      assert.equal(late.when, 12);
      assert.equal(late.offset, 2);
    });

    describe('and it is already fully past', () => {
      it('skips it and still ends the workout when last', async () => {
        await playback.addChunk({ duration: 1 }, 10, true);
        assert.equal(playback.ctx.sources.length, 1);
        assert.equal(ended, 1);
      });
    });
  });

  describe('when stopped', () => {
    it('stops every source and rejects new chunks', async () => {
      await playback.begin({}, () => {}, { isLast: false });
      await playback.addChunk({}, 10, false);
      playback.stop();
      assert.ok(playback.ctx.sources.every((source) => source.stopped));
      assert.equal(await playback.addChunk({}, 20, true), false);
    });
  });
});

describe('ElementPlayback head and progressive swap', () => {
  const saved = {};
  let audios;
  let revoked;
  let urls;
  let failLoads;
  let rejectPlay;
  let blobs;

  class FakeAudio {
    constructor() {
      this.paused = true;
      this.currentTime = 0;
      this.listeners = {};
      this.srcs = [];
      this.playCalls = 0;
      audios.push(this);
    }

    set src(value) {
      this.srcs.push(value);
    }

    play() {
      this.playCalls += 1;

      if (rejectPlay) {
        return Promise.reject(new Error('refused'));
      }

      this.paused = false;

      return Promise.resolve();
    }

    pause() {
      this.paused = true;
    }

    removeAttribute() {}

    load() {
      this.paused = true;
      this.currentTime = 0;
      const type = failLoads > 0 ? 'error' : 'loadedmetadata';
      failLoads = Math.max(0, failLoads - 1);
      setImmediate(() => this.listeners[type]?.());
    }

    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }

    removeEventListener(type, listener) {
      if (this.listeners[type] === listener) {
        delete this.listeners[type];
      }
    }
  }

  function chunk(length, value = 0.25) {
    return { numberOfChannels: 1, sampleRate: 10, length, getChannelData: () => new Float32Array(length).fill(value) };
  }

  beforeEach(() => {
    for (const key of ['Audio', 'URL']) {
      saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    }

    audios = [];
    revoked = [];
    urls = 0;
    failLoads = 0;
    rejectPlay = false;
    blobs = [];
    Object.defineProperty(globalThis, 'Audio', { value: FakeAudio, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'URL', {
      value: Object.assign(function URLStub() {}, {
        createObjectURL: (blob) => {
          blobs.push(blob);

          return `blob:${urls++}`;
        },
        revokeObjectURL: (url) => revoked.push(url)
      }),
      configurable: true,
      writable: true
    });
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

  let finished;

  async function beginWithHead() {
    const playback = new ElementPlayback();
    finished = 0;
    playback.prime();
    await playback.begin(chunk(30), () => {
      finished += 1;
    }, { isLast: false, trackSeconds: 20, tailSeconds: 1 });
    await new Promise((resolve) => setImmediate(resolve));

    return playback;
  }

  describe('when the head begins', () => {
    it('plays the head track first', async () => {
      const playback = await beginWithHead();
      assert.equal(playback.audio.paused, false);
      assert.equal(playback.audio.srcs.length, 2);
    });

    it('cuts the head before its un-summed tail', async () => {
      await beginWithHead();
      assert.equal(blobs[blobs.length - 1].size, 44 + 20 * 2);
    });

    it('holds the track as 16-bit samples', async () => {
      const playback = await beginWithHead();
      assert.ok(playback.pcm instanceof Int16Array);
    });
  });

  describe('when a chunk does not double the playable length', () => {
    it('keeps the current track', async () => {
      const playback = await beginWithHead();
      await playback.addChunk(chunk(10), 2, false);
      await playback.addChunk(chunk(10), 3, false);
      assert.equal(playback.audio.srcs.length, 2);
    });
  });

  describe('when a chunk doubles the playable length', () => {
    it('swaps to a longer prefix track at the same position', async () => {
      const playback = await beginWithHead();
      playback.audio.currentTime = 1.5;
      await playback.addChunk(chunk(30), 2, false);
      assert.equal(playback.audio.srcs.length, 3);
      assert.ok(playback.audio.currentTime >= 1.5);
      assert.equal(playback.audio.paused, false);
    });

    it('does not report the workout ended when the prefix ends', async () => {
      const playback = await beginWithHead();
      await playback.addChunk(chunk(30), 2, false);
      playback.audio.listeners.ended();
      assert.equal(finished, 0);
    });

    it('cuts the prefix before the new un-summed tail', async () => {
      const playback = await beginWithHead();
      await playback.addChunk(chunk(30), 2, false);
      assert.equal(blobs[blobs.length - 1].size, 44 + 40 * 2);
      assert.equal(playback.trackSeconds, 4);
    });

    it('revokes the replaced url', async () => {
      const playback = await beginWithHead();
      const replaced = playback.objectUrl;
      await playback.addChunk(chunk(30), 2, false);
      assert.ok(revoked.includes(replaced));
    });
  });

  describe('when the last chunk arrives', () => {
    it('always swaps and reports the end of the final track', async () => {
      const playback = await beginWithHead();
      await playback.addChunk(chunk(30), 2, true);
      assert.equal(playback.audio.srcs.length, 3);
      playback.audio.listeners.ended();
      assert.equal(finished, 1);
    });
  });

  describe('when the user pauses during the load', () => {
    it('stays paused at the right position', async () => {
      const playback = await beginWithHead();
      playback.audio.currentTime = 1;
      const swap = playback.addChunk(chunk(30), 2, false);
      playback.pause();
      await swap;
      assert.equal(playback.audio.paused, true);
      assert.ok(playback.audio.currentTime >= 1);
      assert.ok(playback.audio.currentTime < 1.5);
    });
  });

  describe('when the user resumes during the load', () => {
    it('plays after the swap from the held position', async () => {
      const playback = await beginWithHead();
      playback.audio.currentTime = 1;
      playback.pause();
      const swap = playback.addChunk(chunk(30), 2, false);
      const callsBefore = playback.audio.playCalls;
      playback.resume();
      assert.equal(playback.audio.playCalls, callsBefore);
      await swap;
      assert.equal(playback.audio.paused, false);
      assert.ok(playback.audio.currentTime >= 1);
    });
  });

  describe('when playing the swapped track is refused', () => {
    it('reports failure', async () => {
      const playback = await beginWithHead();
      rejectPlay = true;
      assert.equal(await playback.addChunk(chunk(30), 2, false), false);
    });
  });

  describe('when the new track fails to load', () => {
    beforeEach(() => {
      failLoads = 0;
    });

    it('restores the previous track and reports failure', async () => {
      const playback = await beginWithHead();
      const previous = playback.objectUrl;
      failLoads = 1;
      const swapped = await playback.addChunk(chunk(30), 2, false);
      assert.equal(swapped, false);
      assert.equal(playback.audio.srcs[playback.audio.srcs.length - 1], previous);
      assert.equal(playback.objectUrl, previous);
      assert.equal(playback.audio.paused, false);
    });
  });

  describe('when stopped mid-swap', () => {
    it('revokes every object url', async () => {
      const playback = await beginWithHead();
      const current = playback.objectUrl;
      const swap = playback.addChunk(chunk(30), 2, false);
      playback.stop();
      assert.equal(await swap, false);
      assert.ok(revoked.includes(current));
      assert.ok(revoked.includes('blob:2'));
    });
  });
});
