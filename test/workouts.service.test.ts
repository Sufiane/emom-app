import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { HTTPException } from 'hono/http-exception';
import type { UserId } from '../src/lib/brand/user-id';
import type { WorkoutId } from '../src/lib/brand/workout-id';
import type { WorkoutRow, WorkoutsDb } from '../src/modules/workouts/workouts.db';
import { WorkoutsService, type WorkoutInput } from '../src/modules/workouts/workouts.service';

class FakeWorkoutsDb {
  rows = new Map<string, WorkoutRow>();

  listByUser(userId: UserId): Promise<WorkoutRow[]> {
    return Promise.resolve([...this.rows.values()].filter((row) => row.user_id === userId));
  }

  findById(id: WorkoutId): Promise<WorkoutRow | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  insert(row: WorkoutRow): Promise<void> {
    this.rows.set(row.id, row);

    return Promise.resolve();
  }

  update(row: WorkoutRow): Promise<void> {
    this.rows.set(row.id, row);

    return Promise.resolve();
  }

  deleteById(id: WorkoutId): Promise<void> {
    this.rows.delete(id);

    return Promise.resolve();
  }
}

const USER = 'user-1' as UserId;

const RANDOM: WorkoutInput = {
  name: ' Random burst ',
  type: 'random',
  total_sec: 600,
  min_rest_sec: 15,
  burst_min_sec: 15,
  burst_max_sec: 30
};

const EMOM: WorkoutInput = {
  name: 'Emom',
  type: 'emom',
  rounds: 10,
  work_sec: 60,
  rest_sec: 0,
  warning_lead_sec: 5
};

const INTERVALS: WorkoutInput = {
  name: 'Intervals',
  type: 'intervals',
  rounds: 8,
  work_sec: 40,
  rest_sec: 20,
  warning_lead_sec: 5
};

const PYRAMID: WorkoutInput = {
  name: ' Ladder ',
  type: 'pyramids',
  mode: 'normal',
  layers: [10, 20, 30],
  rest_sec: 0,
  warning_lead_sec: 5
};

const HARD_PYRAMID: WorkoutInput = {
  name: 'Hard ladder',
  type: 'pyramids',
  mode: 'hard',
  layers: [20, 40, 60],
  rest_sec: 15,
  warning_lead_sec: 5
};

async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof HTTPException);
    assert.equal(error.status, 400);

    return error.message;
  }

  throw new Error('expected rejection');
}

describe('WorkoutsService', () => {
  let db: FakeWorkoutsDb;
  let service: WorkoutsService;

  beforeEach(() => {
    mock.method(console, 'warn', () => undefined);
    db = new FakeWorkoutsDb();
    service = new WorkoutsService(db as unknown as WorkoutsDb);
  });

  describe('create with a valid random payload', () => {
    it('stores the random columns and nulls the others', async () => {
      const row = await service.create(USER, RANDOM);

      assert.equal(row.type, 'random');
      assert.equal(row.name, 'Random burst');
      assert.equal(row.rounds, null);
      assert.equal(row.work_sec, null);
      assert.equal(row.rest_sec, 0);
      assert.equal(row.warning_lead_sec, 0);
      assert.deepEqual(
        [row.total_sec, row.min_rest_sec, row.burst_min_sec, row.burst_max_sec],
        [600, 15, 15, 30]
      );
      assert.equal(db.rows.get(row.id), row);
    });
  });

  describe('create when burst_min_sec exceeds burst_max_sec', () => {
    it('rejects with burst_min_exceeds_max', async () => {
      const input = { ...RANDOM, burst_min_sec: 40, burst_max_sec: 20 } as WorkoutInput;

      assert.equal(await rejectionMessage(service.create(USER, input)), 'burst_min_exceeds_max');
      assert.equal(db.rows.size, 0);
    });
  });

  describe('create when total_sec is too short for one burst', () => {
    it('rejects with total_sec_too_short', async () => {
      const input = { ...RANDOM, total_sec: 60, min_rest_sec: 30, burst_min_sec: 30, burst_max_sec: 30 } as WorkoutInput;

      assert.equal(await rejectionMessage(service.create(USER, input)), 'total_sec_too_short');
    });
  });

  describe('create with out-of-range or non-integer random values', () => {
    const cases: Array<[string, unknown, string]> = [
      ['total_sec', 59, 'total_sec_out_of_range'],
      ['total_sec', 3_601, 'total_sec_out_of_range'],
      ['total_sec', 90.5, 'total_sec_not_integer'],
      ['total_sec', '600', 'total_sec_not_integer'],
      ['min_rest_sec', 4, 'min_rest_sec_out_of_range'],
      ['min_rest_sec', 121, 'min_rest_sec_out_of_range'],
      ['burst_min_sec', 4, 'burst_min_sec_out_of_range'],
      ['burst_min_sec', null, 'burst_min_sec_not_integer'],
      ['burst_max_sec', 121, 'burst_max_sec_out_of_range'],
      ['burst_max_sec', Number.NaN, 'burst_max_sec_not_integer']
    ];

    for (const [field, value, code] of cases) {
      it(`rejects ${field}=${String(value)} with ${code}`, async () => {
        const input = { ...RANDOM, [field]: value } as WorkoutInput;

        assert.equal(await rejectionMessage(service.create(USER, input)), code);
      });
    }
  });

  describe('create with a missing or invalid name', () => {
    it('rejects a blank name with name_required', async () => {
      assert.equal(await rejectionMessage(service.create(USER, { ...RANDOM, name: '  ' })), 'name_required');
    });

    it('rejects a long name with name_too_long', async () => {
      assert.equal(await rejectionMessage(service.create(USER, { ...RANDOM, name: 'x'.repeat(81) })), 'name_too_long');
    });
  });

  describe('create with an unknown type', () => {
    it('rejects with type_invalid', async () => {
      const input = { name: 'x', type: 'tabata' } as unknown as WorkoutInput;

      assert.equal(await rejectionMessage(service.create(USER, input)), 'type_invalid');
    });
  });

  describe('update switching random to emom', () => {
    it('replaces the random columns with emom values', async () => {
      const created = await service.create(USER, RANDOM);
      const updated = await service.update(USER, created.id, EMOM);

      assert.equal(updated.id, created.id);
      assert.equal(updated.created_at, created.created_at);
      assert.equal(updated.type, 'emom');
      assert.equal(updated.rounds, 10);
      assert.equal(updated.work_sec, 60);
      assert.equal('total_sec' in updated, false);
      assert.equal(db.rows.get(created.id), updated);
    });
  });

  describe('update of a workout owned by another user', () => {
    it('rejects with workout_not_found', async () => {
      const created = await service.create(USER, RANDOM);

      await assert.rejects(service.update('other' as UserId, created.id, RANDOM), (error: unknown) => {
        assert.ok(error instanceof HTTPException);
        assert.equal(error.status, 404);
        assert.equal(error.message, 'workout_not_found');

        return true;
      });
    });
  });

  describe('create with a valid normal pyramid', () => {
    it('stores mode and layers, nulls the timed columns and zeroes rest', async () => {
      const row = await service.create(USER, PYRAMID);

      assert.equal(row.type, 'pyramids');
      assert.equal(row.name, 'Ladder');
      assert.equal(row.rounds, null);
      assert.equal(row.work_sec, null);
      assert.equal(row.rest_sec, 0);
      assert.equal(row.warning_lead_sec, 5);
      assert.equal(row.type === 'pyramids' && row.mode, 'normal');
      assert.deepEqual(row.type === 'pyramids' && row.layers, [10, 20, 30]);
      assert.equal(db.rows.get(row.id), row);
    });
  });

  describe('create with a valid hard pyramid', () => {
    it('stores the shared rest', async () => {
      const row = await service.create(USER, HARD_PYRAMID);

      assert.equal(row.rest_sec, 15);
      assert.equal(row.type === 'pyramids' && row.mode, 'hard');
    });
  });

  describe('create with an invalid pyramid', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['mode is unknown', { mode: 'easy' }, 'mode_invalid'],
      ['layers is not an array', { layers: '10,20,30' }, 'layers_invalid'],
      ['there are only two layers', { layers: [10, 20] }, 'layers_too_few'],
      ['a layer is below 5 seconds', { layers: [4, 20, 30] }, 'work_out_of_range'],
      ['a layer is above 600 seconds', { layers: [10, 20, 601] }, 'work_out_of_range'],
      ['a layer is not an integer', { layers: [10, 20.5, 30] }, 'work_out_of_range'],
      ['a layer is a string', { layers: [10, '20', 30] }, 'work_out_of_range'],
      ['two layers are equal', { layers: [10, 20, 20] }, 'layers_not_ascending'],
      ['layers descend', { layers: [30, 20, 10] }, 'layers_not_ascending'],
      ['normal mode has a non-zero rest', { rest_sec: 30 }, 'rest_sec_must_be_zero'],
      ['lead equals the first layer', { warning_lead_sec: 10, layers: [10, 20, 30] }, 'lead_too_long'],
      ['lead is below the allowed range', { warning_lead_sec: 2 }, 'warning_lead_sec_out_of_range']
    ];

    for (const [condition, patch, code] of cases) {
      describe(`when ${condition}`, () => {
        it(`rejects with ${code}`, async () => {
          const input = { ...PYRAMID, ...patch } as WorkoutInput;

          assert.equal(await rejectionMessage(service.create(USER, input)), code);
          assert.equal(db.rows.size, 0);
        });
      });
    }
  });

  describe('create with an invalid hard pyramid', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['rest is missing', { rest_sec: undefined }, 'rest_out_of_range'],
      ['rest is zero', { rest_sec: 0 }, 'rest_out_of_range'],
      ['rest is not an integer', { rest_sec: 7.5 }, 'rest_out_of_range'],
      ['rest is one above first layer', { rest_sec: 21 }, 'rest_too_close_to_work'],
      ['lead equals the shared rest', { rest_sec: 5, warning_lead_sec: 5 }, 'lead_too_long']
    ];

    for (const [condition, patch, code] of cases) {
      describe(`when ${condition}`, () => {
        it(`rejects with ${code}`, async () => {
          const input = { ...HARD_PYRAMID, ...patch } as WorkoutInput;

          assert.equal(await rejectionMessage(service.create(USER, input)), code);
        });
      });
    }
  });

  describe('create at the pyramid boundaries', () => {
    describe('when there are 3 layers or 50 layers', () => {
      it('accepts both', async () => {
        const many = Array.from({ length: 50 }, (unused, index) => 10 + index);

        await service.create(USER, { ...PYRAMID, layers: [10, 20, 30] } as WorkoutInput);
        await service.create(USER, { ...PYRAMID, layers: many } as WorkoutInput);

        assert.equal(db.rows.size, 2);
      });
    });

    describe('when hard rest equals the first layer', () => {
      it('accepts it', async () => {
        const row = await service.create(USER, {
          ...HARD_PYRAMID,
          layers: [10, 40, 60],
          rest_sec: 10,
          warning_lead_sec: 3
        } as WorkoutInput);

        assert.equal(row.rest_sec, 10);
      });
    });

    describe('when layers sit on the 5 and 600 second bounds', () => {
      it('accepts them', async () => {
        const row = await service.create(USER, { ...PYRAMID, layers: [5, 300, 600], warning_lead_sec: 3 } as WorkoutInput);

        assert.equal(row.type === 'pyramids' && row.layers[0], 5);
      });
    });

    describe('when the top two layers are both 600', () => {
      it('rejects with layers_not_ascending', async () => {
        const input = { ...PYRAMID, layers: [5, 600, 600], warning_lead_sec: 3 } as WorkoutInput;

        assert.equal(await rejectionMessage(service.create(USER, input)), 'layers_not_ascending');
      });
    });
  });

  describe('update switching emom to pyramids', () => {
    it('replaces the row and keeps id and created_at', async () => {
      const created = await service.create(USER, EMOM);
      const updated = await service.update(USER, created.id, PYRAMID);

      assert.equal(updated.id, created.id);
      assert.equal(updated.created_at, created.created_at);
      assert.equal(updated.type, 'pyramids');
    });
  });

  describe('update switching pyramids to emom', () => {
    it('drops mode and layers from the stored row', async () => {
      const created = await service.create(USER, PYRAMID);
      const updated = await service.update(USER, created.id, EMOM);

      assert.equal(updated.type, 'emom');
      assert.equal('layers' in updated, false);
    });
  });

  describe('emom regression', () => {
    it('accepts a valid payload', async () => {
      const row = await service.create(USER, EMOM);

      assert.equal(row.type, 'emom');
      assert.equal(row.rest_sec, 0);
    });

    it('rejects an interval that is not allowed', async () => {
      const input = { ...EMOM, work_sec: 45 } as WorkoutInput;

      assert.equal(await rejectionMessage(service.create(USER, input)), 'work_sec_interval_not_allowed');
    });

    it('rejects a non-zero rest_sec', async () => {
      const input = { ...EMOM, rest_sec: 10 } as WorkoutInput;

      assert.equal(await rejectionMessage(service.create(USER, input)), 'rest_sec_must_be_zero');
    });
  });

  describe('intervals regression', () => {
    it('accepts a valid payload', async () => {
      const row = await service.create(USER, INTERVALS);

      assert.equal(row.type, 'intervals');
      assert.equal(row.rest_sec, 20);
    });

    it('rejects a warning lead not shorter than rest', async () => {
      const input = { ...INTERVALS, rest_sec: 5, warning_lead_sec: 5 } as WorkoutInput;

      assert.equal(await rejectionMessage(service.create(USER, input)), 'warning_lead_too_long');
    });

    it('rejects out-of-range rounds', async () => {
      const input = { ...INTERVALS, rounds: 121 } as WorkoutInput;

      assert.equal(await rejectionMessage(service.create(USER, input)), 'rounds_out_of_range');
    });
  });
});
