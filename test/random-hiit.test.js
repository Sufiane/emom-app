import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateBurstSchedule, maxBursts, segmentsFromBursts, validateRandomConfig } from '../public/js/random-hiit.js';

function scriptedRandom(values) {
  let index = 0;

  return () => {
    const value = values[index % values.length];
    index += 1;

    return value;
  };
}

function seededRandom(seed) {
  let state = seed;

  return () => {
    state = (state + 0x6d_2b_79_f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const CONFIG = { totalSec: 120, minRestSec: 15, burstMinSec: 15, burstMaxSec: 30 };

describe('maxBursts', () => {
  describe('when every burst is as short as allowed', () => {
    it('counts bursts that fit with rest on both sides', () => {
      assert.equal(maxBursts(CONFIG), 3);
    });
  });

  describe('when the total is too short for one burst', () => {
    it('returns 0', () => {
      assert.equal(maxBursts({ ...CONFIG, totalSec: 40 }), 0);
    });
  });
});

describe('validateRandomConfig', () => {
  describe('when the config is valid', () => {
    it('returns null', () => {
      assert.equal(validateRandomConfig(CONFIG), null);
    });
  });

  describe('when a value is zero, blank or not a whole number', () => {
    const invalidValues = [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 7.5];

    for (const field of ['totalSec', 'minRestSec', 'burstMinSec', 'burstMaxSec']) {
      it(`returns config_invalid for ${field}`, () => {
        for (const value of invalidValues) {
          assert.equal(validateRandomConfig({ ...CONFIG, [field]: value }), 'config_invalid');
        }
      });
    }
  });

  describe('when the shortest burst exceeds the longest', () => {
    it('returns burst_range_invalid', () => {
      assert.equal(
        validateRandomConfig({ ...CONFIG, burstMinSec: 30, burstMaxSec: 15 }),
        'burst_range_invalid'
      );
    });
  });

  describe('when the total is too short for one burst', () => {
    it('returns total_too_short', () => {
      assert.equal(validateRandomConfig({ ...CONFIG, totalSec: 40 }), 'total_too_short');
    });
  });
});

describe('generateBurstSchedule', () => {
  describe('when the burst range is invalid', () => {
    it('throws burst_range_invalid', () => {
      assert.throws(
        () => generateBurstSchedule({ ...CONFIG, burstMinSec: 30, burstMaxSec: 15 }),
        { message: 'burst_range_invalid' }
      );
    });
  });

  describe('when a value is zero', () => {
    it('throws config_invalid', () => {
      assert.throws(
        () => generateBurstSchedule({ ...CONFIG, minRestSec: 0, burstMinSec: 0 }),
        { message: 'config_invalid' }
      );
    });
  });

  describe('when the total is too short for one burst', () => {
    it('throws total_too_short', () => {
      assert.throws(
        () => generateBurstSchedule({ ...CONFIG, totalSec: 40 }),
        { message: 'total_too_short' }
      );
    });
  });

  describe('when the rng always returns 0', () => {
    it('places the fewest shortest bursts packed at the start', () => {
      const bursts = generateBurstSchedule({ ...CONFIG, random: () => 0 });

      assert.deepEqual(bursts, [
        { start: 15, end: 30 },
        { start: 45, end: 60 }
      ]);
    });
  });

  describe('when the rng always returns its highest value', () => {
    it('scales the oversized durations down to fit, with no slack', () => {
      const bursts = generateBurstSchedule({ ...CONFIG, random: () => 0.999 });

      assert.deepEqual(bursts, [
        { start: 15, end: 35 },
        { start: 50, end: 70 },
        { start: 85, end: 105 }
      ]);
    });
  });

  describe('when the rng yields mid values', () => {
    it('draws per-burst durations and spreads the slack across the gaps', () => {
      const bursts = generateBurstSchedule({ ...CONFIG, random: scriptedRandom([0, 0.5, 0.5, 0.5, 0.5]) });

      assert.deepEqual(bursts, [
        { start: 30, end: 53 },
        { start: 68, end: 91 }
      ]);
    });
  });

  describe('when run over many random seeds and configs', () => {
    const configs = [
      CONFIG,
      { totalSec: 300, minRestSec: 20, burstMinSec: 10, burstMaxSec: 40 },
      { totalSec: 60, minRestSec: 5, burstMinSec: 5, burstMaxSec: 5 },
      { totalSec: 3600, minRestSec: 120, burstMinSec: 30, burstMaxSec: 120 },
      { totalSec: 50, minRestSec: 15, burstMinSec: 15, burstMaxSec: 30 }
    ];

    it('keeps every invariant', () => {
      for (const config of configs) {
        const most = maxBursts(config);
        const fewest = Math.max(1, Math.ceil(most / 2));

        for (let seed = 1; seed <= 500; seed++) {
          const bursts = generateBurstSchedule({ ...config, random: seededRandom(seed) });

          assert.ok(bursts.length >= fewest && bursts.length <= most);
          assert.ok(bursts[0].start >= config.minRestSec);
          assert.ok(bursts.at(-1).end <= config.totalSec - config.minRestSec);

          for (let i = 0; i < bursts.length; i++) {
            const duration = bursts[i].end - bursts[i].start;

            assert.ok(Number.isInteger(bursts[i].start) && Number.isInteger(bursts[i].end));
            assert.ok(duration >= config.burstMinSec && duration <= config.burstMaxSec);

            if (i > 0) {
              assert.ok(bursts[i].start - bursts[i - 1].end >= config.minRestSec);
            }
          }
        }
      }
    });
  });
});

describe('segmentsFromBursts', () => {
  describe('when given two bursts and a start offset', () => {
    const bursts = [{ start: 15, end: 35 }, { start: 50, end: 70 }];
    const segments = segmentsFromBursts(bursts, 120, 3.15);

    it('alternates rest and work, ending on rest', () => {
      assert.deepEqual(
        segments.map((segment) => segment.kind),
        ['rest', 'work', 'rest', 'work', 'rest']
      );
    });

    it('numbers bursts from 1 and carries the last index through rests', () => {
      assert.deepEqual(
        segments.map((segment) => segment.round),
        [0, 1, 1, 2, 2]
      );
    });

    it('is contiguous across the whole offset total', () => {
      assert.equal(segments[0].start, 3.15);
      assert.equal(segments.at(-1).end, 123.15);

      for (let i = 1; i < segments.length; i++) {
        assert.equal(segments[i].start, segments[i - 1].end);
      }
    });
  });
});
