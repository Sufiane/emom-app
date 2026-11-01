import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { intervalTotalSeconds, workoutTotalSeconds } from '../public/js/schedule.js';

describe('intervalTotalSeconds', () => {
  describe('when rest is 0', () => {
    it('is rounds times work', () => {
      assert.equal(intervalTotalSeconds({ rounds: 10, work_sec: 60, rest_sec: 0 }), 600);
    });
  });

  describe('when rest is positive', () => {
    it('counts one fewer rest than rounds', () => {
      assert.equal(intervalTotalSeconds({ rounds: 8, work_sec: 20, rest_sec: 10 }), 230);
    });
  });

  describe('when there is a single round', () => {
    it('has no rest', () => {
      assert.equal(intervalTotalSeconds({ rounds: 1, work_sec: 30, rest_sec: 20 }), 30);
    });
  });

  describe('when rest_sec is undefined', () => {
    it('treats rest as 0', () => {
      assert.equal(intervalTotalSeconds({ rounds: 4, work_sec: 60 }), 240);
    });
  });
});

describe('workoutTotalSeconds', () => {
  describe('when the workout is random', () => {
    it('returns total_sec', () => {
      assert.equal(workoutTotalSeconds({ type: 'random', total_sec: 300 }), 300);
    });
  });

  describe('when the workout is timed', () => {
    it('uses the interval formula', () => {
      assert.equal(workoutTotalSeconds({ type: 'intervals', rounds: 8, work_sec: 20, rest_sec: 10 }), 230);
    });
  });
});
