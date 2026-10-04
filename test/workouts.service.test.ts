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
