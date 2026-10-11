import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { getMixWithMusic, setMixWithMusic } from '../public/js/audio-prefs.js';

function memoryStorage() {
  const store = new Map();

  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value))
  };
}

describe('audio prefs', () => {
  let original;

  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  });

  afterEach(() => {
    if (original) {
      Object.defineProperty(globalThis, 'localStorage', original);
    } else {
      delete globalThis.localStorage;
    }
  });

  function useStorage(storage) {
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  }

  describe('when nothing is stored', () => {
    it('defaults to true', () => {
      useStorage(memoryStorage());
      assert.equal(getMixWithMusic(), true);
    });
  });

  describe('on iOS', () => {
    let navigatorDescriptor;

    beforeEach(() => {
      navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    });

    afterEach(() => {
      Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    });

    function useNavigator(value) {
      Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
    }

    describe('when nothing is stored', () => {
      it('defaults to false on iPhone', () => {
        useStorage(memoryStorage());
        useNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', maxTouchPoints: 5 });
        assert.equal(getMixWithMusic(), false);
      });

      it('defaults to false on iPadOS reporting as Macintosh', () => {
        useStorage(memoryStorage());
        useNavigator({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 });
        assert.equal(getMixWithMusic(), false);
      });

      it('defaults to true on a desktop Mac', () => {
        useStorage(memoryStorage());
        useNavigator({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 });
        assert.equal(getMixWithMusic(), true);
      });
    });

    describe('when true is stored', () => {
      it('returns true', () => {
        useStorage(memoryStorage());
        useNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', maxTouchPoints: 5 });
        setMixWithMusic(true);
        assert.equal(getMixWithMusic(), true);
      });
    });
  });

  describe('when set to false', () => {
    it('reads back false', () => {
      useStorage(memoryStorage());
      setMixWithMusic(false);
      assert.equal(getMixWithMusic(), false);
    });

    it('reads back true after set to true', () => {
      useStorage(memoryStorage());
      setMixWithMusic(false);
      setMixWithMusic(true);
      assert.equal(getMixWithMusic(), true);
    });
  });

  describe('when storage throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      }
    };

    it('returns true on read', () => {
      useStorage(throwing);
      assert.equal(getMixWithMusic(), true);
    });

    it('does not throw on write', () => {
      useStorage(throwing);
      assert.doesNotThrow(() => setMixWithMusic(false));
    });
  });
});
