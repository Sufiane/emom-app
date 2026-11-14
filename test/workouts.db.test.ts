import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { UserId } from '../src/lib/brand/user-id';
import type { WorkoutId } from '../src/lib/brand/workout-id';
import { WorkoutsDb, type WorkoutRow } from '../src/modules/workouts/workouts.db';

type Call = { sql: string; args: unknown[] };

class FakeD1 {
  calls: Call[] = [];
  stored: Record<string, unknown>[] = [];

  prepare(sql: string): unknown {
    return {
      bind: (...args: unknown[]): unknown => {
        this.calls.push({ sql, args });

        return {
          run: (): Promise<void> => Promise.resolve(),
          first: (): Promise<unknown> => Promise.resolve(this.stored[0] ?? null),
          all: (): Promise<unknown> => Promise.resolve({ results: this.stored })
        };
      }
    };
  }
}

const PYRAMID = {
  id: 'w1',
  user_id: 'u1',
  name: 'Ladder',
  type: 'pyramids',
  rounds: null,
  work_sec: null,
  rest_sec: 0,
  warning_lead_sec: 5,
  mode: 'normal',
  layers: [10, 20, 30],
  created_at: 1,
  updated_at: 1
} as unknown as WorkoutRow;

const EMOM = { ...PYRAMID, type: 'emom', rounds: 10, work_sec: 60 } as unknown as WorkoutRow;

describe('WorkoutsDb', () => {
  let fake: FakeD1;
  let db: WorkoutsDb;

  beforeEach(() => {
    fake = new FakeD1();
    db = new WorkoutsDb(fake as unknown as D1Database);
  });

  describe('insert of a pyramid', () => {
    it('binds mode and JSON layers', async () => {
      await db.insert(PYRAMID);

      const args = fake.calls[0].args;

      assert.equal(args.length, 16);
      assert.ok(args.includes('normal'));
      assert.ok(args.includes('[10,20,30]'));
    });
  });

  describe('insert of a non-pyramid', () => {
    it('binds NULL for mode and layers', async () => {
      await db.insert(EMOM);

      const args = fake.calls[0].args;

      assert.equal(args.length, 16);
      assert.equal(args.includes('[10,20,30]'), false);
      assert.equal(args.includes('normal'), false);
    });
  });

  describe('update of a pyramid', () => {
    it('binds mode and JSON layers', async () => {
      await db.update(PYRAMID);

      assert.ok(fake.calls[0].args.includes('normal'));
      assert.ok(fake.calls[0].args.includes('[10,20,30]'));
    });
  });

  describe('reading a stored pyramid', () => {
    beforeEach(() => {
      fake.stored = [{ ...PYRAMID, layers: '[10,20,30]' }];
    });

    it('findById returns layers as an array', async () => {
      const row = await db.findById('w1' as WorkoutId);

      assert.deepEqual(row?.type === 'pyramids' && row.layers, [10, 20, 30]);
    });

    it('listByUser returns layers as an array', async () => {
      const rows = await db.listByUser('u1' as UserId);

      assert.deepEqual(rows[0].type === 'pyramids' && rows[0].layers, [10, 20, 30]);
    });
  });

  describe('reading a stored pyramid with corrupt layers JSON', () => {
    beforeEach(() => {
      fake.stored = [{ ...PYRAMID, layers: '[10,20' }];
    });

    it('findById throws', async () => {
      await assert.rejects(db.findById('w1' as WorkoutId), SyntaxError);
    });

    it('listByUser throws', async () => {
      await assert.rejects(db.listByUser('u1' as UserId), SyntaxError);
    });
  });

  describe('reading a stored emom row', () => {
    it('passes the row through', async () => {
      fake.stored = [{ ...EMOM, mode: null, layers: null }];

      const row = await db.findById('w1' as WorkoutId);

      assert.equal(row?.type, 'emom');
    });
  });

  describe('reading when no row exists', () => {
    it('findById returns null', async () => {
      assert.equal(await db.findById('missing' as WorkoutId), null);
    });
  });
});
