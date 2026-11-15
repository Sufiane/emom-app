import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stepsOf, validatePyramid } from '../public/js/pyramids.js';

function pyramid(overrides = {}) {
  return { type: 'pyramids', name: 'Test', mode: 'normal', layers: [10, 20, 30], rest_sec: 0, warning_lead_sec: 3, ...overrides };
}

describe('stepsOf', () => {
  describe('when the mode is normal', () => {
    it('mirrors the ascent and rests as long as it works', () => {
      assert.deepEqual(stepsOf(pyramid()), [
        { work_sec: 10, rest_sec: 10 },
        { work_sec: 20, rest_sec: 20 },
        { work_sec: 30, rest_sec: 30 },
        { work_sec: 20, rest_sec: 20 },
        { work_sec: 10, rest_sec: 10 }
      ]);
    });

    it('plays the peak once', () => {
      const peaks = stepsOf(pyramid()).filter((step) => step.work_sec === 30);
      assert.equal(peaks.length, 1);
    });
  });

  describe('when the mode is hard', () => {
    it('uses the shared rest on every step including the mirrored ones', () => {
      const steps = stepsOf(pyramid({ mode: 'hard', rest_sec: 5 }));
      assert.deepEqual(steps.map((step) => step.work_sec), [10, 20, 30, 20, 10]);
      assert.ok(steps.every((step) => step.rest_sec === 5));
    });
  });

  describe('when called', () => {
    it('does not mutate the input layers', () => {
      const workout = pyramid();
      stepsOf(workout);
      assert.deepEqual(workout.layers, [10, 20, 30]);
    });
  });
});

describe('validatePyramid', () => {
  describe('when the pyramid is valid', () => {
    it('returns null for normal 10/20/30 with lead 3', () => {
      assert.equal(validatePyramid(pyramid()), null);
    });

    it('returns null for 15 layers', () => {
      const layers = Array.from({ length: 15 }, (_, index) => 10 + index * 5);
      assert.equal(validatePyramid(pyramid({ layers })), null);
    });
  });

  describe('when there are fewer than 3 layers', () => {
    it('returns layers_too_few', () => {
      assert.equal(validatePyramid(pyramid({ layers: [10, 20] })), 'layers_too_few');
    });
  });

  describe('when a layer equals the previous one', () => {
    it('returns layers_not_ascending', () => {
      assert.equal(validatePyramid(pyramid({ layers: [10, 20, 20] })), 'layers_not_ascending');
    });
  });

  describe('when a layer is lower than the previous one', () => {
    it('returns layers_not_ascending', () => {
      assert.equal(validatePyramid(pyramid({ layers: [10, 30, 20] })), 'layers_not_ascending');
    });
  });

  describe('when a work time is out of range', () => {
    it('rejects a layer below 5', () => {
      assert.equal(validatePyramid(pyramid({ layers: [4, 20, 30] })), 'work_out_of_range');
    });

    it('rejects a layer above 600', () => {
      assert.equal(validatePyramid(pyramid({ layers: [10, 20, 601] })), 'work_out_of_range');
    });

    it('reports a blank layer as out of range, not unordered', () => {
      assert.equal(validatePyramid(pyramid({ layers: [10, 0, 30] })), 'work_out_of_range');
    });

    it('accepts the boundaries 5 and 600', () => {
      assert.equal(validatePyramid(pyramid({ layers: [5, 20, 600], warning_lead_sec: 0 })), null);
    });
  });

  describe('when the mode is hard', () => {
    describe('and rest equals the first layer', () => {
      it('returns null', () => {
        assert.equal(validatePyramid(pyramid({ mode: 'hard', layers: [10, 30, 40], rest_sec: 10 })), null);
      });
    });

    describe('and rest is one above the first layer', () => {
      it('returns rest_too_close_to_work', () => {
        assert.equal(
          validatePyramid(pyramid({ mode: 'hard', layers: [20, 30, 40], rest_sec: 21 })),
          'rest_too_close_to_work'
        );
      });
    });

    describe('and rest is below 1', () => {
      it('returns rest_out_of_range', () => {
        assert.equal(validatePyramid(pyramid({ mode: 'hard', rest_sec: 0 })), 'rest_out_of_range');
      });
    });

    describe('and rest is not an integer', () => {
      it('returns rest_out_of_range', () => {
        assert.equal(validatePyramid(pyramid({ mode: 'hard', rest_sec: 2.5 })), 'rest_out_of_range');
      });
    });
  });

  describe('when the warning lead is not shorter than the shortest segment', () => {
    it('returns lead_too_long in normal mode', () => {
      assert.equal(validatePyramid(pyramid({ warning_lead_sec: 10 })), 'lead_too_long');
    });

    it('returns lead_too_long when the hard rest is the shortest segment', () => {
      assert.equal(
        validatePyramid(pyramid({ mode: 'hard', layers: [20, 30, 40], rest_sec: 3, warning_lead_sec: 3 })),
        'lead_too_long'
      );
    });
  });
});
