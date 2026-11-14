# Pyramids Saving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Logged-in users can create, list, edit, run and delete pyramid workouts; guests keep quick-run.

**Architecture:** Additive D1 migration (two nullable columns, `mode` and `layers` JSON text). Hexagonal backend: new brands, `validatePyramids` in the service (no ORM), JSON (de)serialisation only in `workouts.db.ts`. Frontend reuses slice 1 form, runner and `stepsOf`; only the submit/list/edit wiring changes.

**Tech Stack:** Cloudflare Worker, Hono, D1, TypeScript (backend, `node --test` via tsx), vanilla JS PWA (`public/`).

**Spec:** `docs/specs/2026-11-14-pyramids-saving-design.md`

## Global Constraints

- Commits and PR titles: Conventional Commits, lowercase imperative (`feat(workouts): accept pyramids workouts`). Trailer on commits: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Stage changes and stop for `/crit` review before committing implementation work.
- Branch name: lowercase ticket key, number zero-padded to two digits (rename before pushing).
- Backend style: explicit return types on every function; no single-letter names (loop `i` only); braces on every `if`, blank line before `if`/`for`/`return`/`throw`; no `!!`; `private readonly` constructor params; numeric separators for literals of 5+ digits; no barrel files; no comments unless a non-obvious why.
- Error codes are snake_case; services log detail with `console.warn` before throwing (existing pattern in `workouts.service.ts`); brand constructors throw only the code and never log.
- Hexagonal: `workouts.service.ts` imports no D1/ORM; `workouts.db.ts` is the only file that touches D1 and the `layers` JSON text; db never throws domain errors.
- Exact dependency versions only (no dependency changes expected).
- Tests: Node `--test`, nested `describe` per condition ("when ..."), short `it` titles stating the outcome only.
- Validation parity with `public/js/pyramids.js`: min 3 layers, no max, strictly ascending, work 5-600 s, hard shared rest `1..layers[0]-5`, normal rest 0, lead shorter than shortest segment.

## Ticket split and size

Layers touched: schema, backend, web (one actor). Hard cap ~800 lines per PR, tests, migrations and docs included.

| PR | Scope | Depends on | Est. lines |
|---|---|---|---|
| A0 | docs only: this spec + plan (markdown, no code) | none | ~920 (exceeds the cap, but zero code; or drop the plan file from the repo) |
| A | migration `0004` + `schema.sql` | none | ~15 |
| B | backend: brands, db, service, tests | A merged and applied to prod before B is deployed | ~380 |
| C | web: save/list/edit wiring, sw bump | contract only to build; merge after B so the API exists | ~70 |

Total about 465 lines of code, SQL and tests plus ~920 lines of docs. A and B may be merged into one PR (~395, under the cap) if the coordinator prefers fewer PRs, but A stays first in time because the migration must reach production before the Worker deploy. B and C can be built in parallel by two builders against the contract in the spec; C must not be deployed before B.

## File structure

- Create `src/db/migrations/0004_pyramids_workouts.sql`: two `ALTER TABLE ... ADD COLUMN`.
- Modify `src/db/schema.sql`: add `mode`, `layers` columns, type comment.
- Create `src/lib/brand/pyramid-mode.ts`, `layer-sec.ts`, `pyramid-rest-sec.ts`.
- Modify `src/modules/workouts/workouts.db.ts`: `PyramidsWorkoutRow`, `toRow`, columns in insert/update.
- Modify `src/modules/workouts/workouts.service.ts`: `PyramidsInput/Clean`, `validatePyramids`.
- Modify `test/workouts.service.test.ts`; create `test/workouts.db.test.ts`.
- Modify `public/js/app.js`, `public/sw.js`.

## Phase 0 - preflight on the real databases (no code, read-only)

- [ ] Remote: `npx wrangler d1 execute emom-app --remote --command "PRAGMA table_info(workouts)"`. Expect `total_sec`, `min_rest_sec`, `burst_min_sec`, `burst_max_sec` present, `mode` and `layers` absent, `rounds` and `work_sec` nullable.
- [ ] Remote: `npx wrangler d1 execute emom-app --remote --command "SELECT sql FROM sqlite_master WHERE name = 'workouts'"`. Expect no `CHECK`. If a CHECK on `type` exists, STOP and report to the coordinator (it would force a table rebuild).
- [ ] If anything differs from expectations, stop and report; do not improvise a migration.

---

## PR A - migration (PR A0 is the docs-only spec and plan commit: `docs(pyramids): add saving spec and plan`)

### Task 1: migration and schema

**Files:**
- Create: `src/db/migrations/0004_pyramids_workouts.sql`
- Modify: `src/db/schema.sql`

**Interfaces:**
- Produces: columns `workouts.mode TEXT NULL`, `workouts.layers TEXT NULL` used by PR B.

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE workouts ADD COLUMN mode TEXT;
ALTER TABLE workouts ADD COLUMN layers TEXT;
```

- [ ] **Step 2: Update `schema.sql`**

Change the type comment and add the two columns after `burst_max_sec`:

```sql
  type TEXT NOT NULL DEFAULT 'emom',  -- 'emom' | 'intervals' | 'random' | 'pyramids'
  rounds INTEGER,                     -- NULL for random and pyramids
  work_sec INTEGER,                   -- EMOM: interval length; Intervals: work phase; NULL for random and pyramids
  rest_sec INTEGER NOT NULL DEFAULT 0, -- 0 for EMOM, random and normal-mode pyramids; shared rest for hard-mode pyramids
  ...
  burst_max_sec INTEGER,              -- random only
  mode TEXT,                          -- pyramids only: 'normal' | 'hard'
  layers TEXT,                        -- pyramids only: JSON array of work seconds
```

- [ ] **Step 3: Verify on a scratch local DB**

```bash
npx wrangler d1 execute emom-app --local --persist-to /tmp/emom-scratch --command "DROP TABLE IF EXISTS workouts; DROP TABLE IF EXISTS users;"
npx wrangler d1 execute emom-app --local --persist-to /tmp/emom-scratch --file=src/db/schema.sql
```
Expected: succeeds, `PRAGMA table_info(workouts)` lists `mode` and `layers`.

Then simulate prod: create the pre-0004 shape (schema.sql minus the two columns) in a second scratch dir, insert one emom row and one random row, run the migration file, and assert both rows still select unchanged with `mode`/`layers` NULL.

- [ ] **Step 4: Commit (after `/crit`)**

```bash
git add src/db/migrations/0004_pyramids_workouts.sql src/db/schema.sql
git commit -m "feat(db): add pyramids workout columns"
```

### Task 2: apply to production (human-run, between PR A and PR B deploy)

- [ ] **Step 1:** Backup: `npx wrangler d1 export emom-app --remote --output=$HOME/emom-app-backup-2026-11-14.sql`.
- [ ] **Step 2:** `npx wrangler d1 execute emom-app --remote --file=src/db/migrations/0004_pyramids_workouts.sql`.
- [ ] **Step 3:** Re-run the Phase 0 `PRAGMA table_info(workouts)`; `mode` and `layers` present, row count unchanged (`SELECT COUNT(*) FROM workouts` before and after).
- [ ] **Step 4:** Note in PR A that it was applied (the migration is untracked and not re-runnable: a second run fails with `duplicate column name`).
- [ ] **Step 5:** Local dev DBs: `npx wrangler d1 execute emom-app --local --file=src/db/migrations/0004_pyramids_workouts.sql`.

---

## PR B - backend

### Task 3: brands

**Files:**
- Create: `src/lib/brand/pyramid-mode.ts`, `src/lib/brand/layer-sec.ts`, `src/lib/brand/pyramid-rest-sec.ts`

**Interfaces:**
- Produces: `PyramidMode`, `makePyramidMode(value: unknown): PyramidMode`; `LayerSec`, `makeLayerSec(value: unknown): LayerSec`; `PyramidRestSec`, `makePyramidRestSec(value: unknown): PyramidRestSec`.

- [ ] **Step 1: Write the brands**

`src/lib/brand/pyramid-mode.ts`:

```ts
import { badRequest } from '../bad-request';
import type { Brand } from '../brand';

export type PyramidMode = Brand<'normal' | 'hard', 'PyramidMode'>;

export function makePyramidMode(value: unknown): PyramidMode {
  if (value !== 'normal' && value !== 'hard') {
    throw badRequest('mode_invalid');
  }

  return value as PyramidMode;
}
```

`src/lib/brand/layer-sec.ts`:

```ts
import { badRequest } from '../bad-request';
import type { Brand } from '../brand';

export type LayerSec = Brand<number, 'LayerSec'>;

const LAYER_MIN = 5;
const LAYER_MAX = 600;

export function makeLayerSec(value: unknown): LayerSec {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < LAYER_MIN || value > LAYER_MAX) {
    throw badRequest('work_out_of_range');
  }

  return value as LayerSec;
}
```

`src/lib/brand/pyramid-rest-sec.ts`:

```ts
import { badRequest } from '../bad-request';
import type { Brand } from '../brand';

export type PyramidRestSec = Brand<number, 'PyramidRestSec'>;

const REST_MIN = 1;

export function makePyramidRestSec(value: unknown): PyramidRestSec {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < REST_MIN) {
    throw badRequest('rest_out_of_range');
  }

  return value as PyramidRestSec;
}
```

- [ ] **Step 2: Typecheck** `npm run typecheck`. Expected: PASS. (Brands are exercised through the service tests in Task 4; no separate brand tests exist in the repo today.)

### Task 4: service validation (TDD)

**Files:**
- Modify: `src/modules/workouts/workouts.service.ts`
- Modify: `test/workouts.service.test.ts`

**Interfaces:**
- Consumes: brands from Task 3, `makeWarningLeadSec`, `makeWorkoutName`, `badRequest`.
- Produces: `WorkoutInput` now includes `PyramidsInput`; `WorkoutsService.create/update` accept and return pyramids rows (`PyramidsWorkoutRow`, defined in Task 5, so add the db type first or in the same commit; see Step 3 note).

- [ ] **Step 1: Write the failing tests**

Add near the other fixtures:

```ts
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
```

Add these `describe` blocks inside `describe('WorkoutsService', ...)`:

```ts
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
      ['rest is one above first layer minus 5', { rest_sec: 16 }, 'rest_too_close_to_work'],
      ['first layer is 5 seconds', { layers: [5, 20, 30], rest_sec: 1 }, 'rest_too_close_to_work'],
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
    describe('when there are exactly 3 layers and no max', () => {
      it('accepts 3 layers and 50 layers', async () => {
        const many = Array.from({ length: 50 }, (_, index) => 10 + index);

        await service.create(USER, { ...PYRAMID, layers: [10, 20, 30] } as WorkoutInput);
        await service.create(USER, { ...PYRAMID, layers: many } as WorkoutInput);

        assert.equal(db.rows.size, 2);
      });
    });

    describe('when hard rest equals first layer minus 5', () => {
      it('accepts it', async () => {
        const row = await service.create(USER, { ...HARD_PYRAMID, rest_sec: 15, warning_lead_sec: 14 } as WorkoutInput);

        assert.equal(row.rest_sec, 15);
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
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- --test-name-pattern="pyramid"` (or `node --import tsx --test test/workouts.service.test.ts`). Expected: FAIL, pyramid cases reject with `type_invalid`.

- [ ] **Step 3: Implement in `workouts.service.ts`**

Add imports:

```ts
import { makeLayerSec, type LayerSec } from '../../lib/brand/layer-sec';
import { makePyramidMode, type PyramidMode } from '../../lib/brand/pyramid-mode';
import { makePyramidRestSec, type PyramidRestSec } from '../../lib/brand/pyramid-rest-sec';
```

Add types and widen unions:

```ts
type PyramidsInput = {
  name: unknown;
  type: 'pyramids';
  mode: unknown;
  layers: unknown;
  rest_sec?: unknown;
  warning_lead_sec: unknown;
};

export type WorkoutInput = EmomInput | IntervalsInput | RandomInput | PyramidsInput;

type PyramidsClean = {
  name: WorkoutName;
  type: 'pyramids';
  rounds: null;
  work_sec: null;
  rest_sec: 0 | PyramidRestSec;
  warning_lead_sec: WarningLeadSec;
  mode: PyramidMode;
  layers: LayerSec[];
};

type CleanInput = EmomClean | IntervalsClean | RandomClean | PyramidsClean;
```

Add the case to `validateInput`:

```ts
    case 'pyramids':
      return validatePyramids(name, input);
```

Add the functions:

```ts
const MIN_LAYERS = 3;
const HARD_REST_GAP_SEC = 5;

function validatePyramids(name: WorkoutName, input: PyramidsInput): PyramidsClean {
  const mode = makePyramidMode(input.mode);
  const layers = makeLayers(input.layers);
  const restSec = resolvePyramidRest(mode, layers, input.rest_sec);
  const warningLead = makeWarningLeadSec(input.warning_lead_sec);
  const shortest = mode === 'hard' ? Math.min(layers[0], restSec) : layers[0];

  if (warningLead >= shortest) {
    console.warn(`warning_lead_sec ${warningLead} not shorter than shortest pyramid segment ${shortest}`);

    throw badRequest('lead_too_long');
  }

  return { name, type: 'pyramids', rounds: null, work_sec: null, rest_sec: restSec, warning_lead_sec: warningLead, mode, layers };
}

function makeLayers(value: unknown): LayerSec[] {
  if (!Array.isArray(value)) {
    console.warn('pyramid layers is not an array');

    throw badRequest('layers_invalid');
  }

  if (value.length < MIN_LAYERS) {
    console.warn(`pyramid has ${value.length} layers, needs at least ${MIN_LAYERS}`);

    throw badRequest('layers_too_few');
  }

  const layers = value.map((layer: unknown) => makeLayerSec(layer));

  if (layers.some((layer, index) => index > 0 && layer <= layers[index - 1])) {
    console.warn(`pyramid layers not strictly ascending: ${layers.join(',')}`);

    throw badRequest('layers_not_ascending');
  }

  return layers;
}

function resolvePyramidRest(mode: PyramidMode, layers: LayerSec[], value: unknown): 0 | PyramidRestSec {
  if (mode === 'normal') {
    if (value !== 0 && value != null) {
      console.warn(`rest_sec ${String(value)} given for normal pyramid`);

      throw badRequest('rest_sec_must_be_zero');
    }

    return 0;
  }

  const restSec = makePyramidRestSec(value);

  if (restSec > layers[0] - HARD_REST_GAP_SEC) {
    console.warn(`rest_sec ${restSec} exceeds first layer ${layers[0]} minus ${HARD_REST_GAP_SEC}`);

    throw badRequest('rest_too_close_to_work');
  }

  return restSec;
}
```

`PyramidsWorkoutRow` comes from Task 5; do Tasks 4 and 5 in one working tree before typechecking.

- [ ] **Step 4: Run service tests.** `node --import tsx --test test/workouts.service.test.ts`. Expected: PASS, including emom/intervals/random regressions.

### Task 5: db layer and round-trip test

**Files:**
- Modify: `src/modules/workouts/workouts.db.ts`
- Create: `test/workouts.db.test.ts`

**Interfaces:**
- Produces: `PyramidsWorkoutRow`; `WorkoutRow` gains the pyramids member; `WorkoutsDb.listByUser/findById` return parsed `layers: LayerSec[]`.

- [ ] **Step 1: Write the failing db test**

```ts
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

      assert.ok(args.includes('normal'));
      assert.ok(args.includes('[10,20,30]'));
    });
  });

  describe('insert of a non-pyramid', () => {
    it('binds NULL for mode and layers', async () => {
      await db.insert(EMOM);

      const args = fake.calls[0].args;

      assert.equal(args.includes('[10,20,30]'), false);
      assert.equal(args.includes('normal'), false);
    });
  });

  describe('update of a pyramid', () => {
    it('binds mode and JSON layers', async () => {
      await db.update(PYRAMID);

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
```

- [ ] **Step 2: Run to confirm failure.** `node --import tsx --test test/workouts.db.test.ts`. Expected: FAIL (layers not bound / not parsed).

- [ ] **Step 3: Implement in `workouts.db.ts`**

Imports and types:

```ts
import type { LayerSec } from '../../lib/brand/layer-sec';
import type { PyramidMode } from '../../lib/brand/pyramid-mode';
import type { PyramidRestSec } from '../../lib/brand/pyramid-rest-sec';

export type WorkoutType = 'emom' | 'intervals' | 'random' | 'pyramids';

export type PyramidsWorkoutRow = WorkoutBase & {
  type: 'pyramids';
  rounds: null;
  work_sec: null;
  rest_sec: 0 | PyramidRestSec;
  warning_lead_sec: WarningLeadSec;
  mode: PyramidMode;
  layers: LayerSec[];
};

export type WorkoutRow = EmomWorkoutRow | IntervalsWorkoutRow | RandomWorkoutRow | PyramidsWorkoutRow;

type StoredRow =
  | Exclude<WorkoutRow, PyramidsWorkoutRow>
  | (Omit<PyramidsWorkoutRow, 'layers'> & { layers: string });

type PyramidColumns = [PyramidMode | null, string | null];

function pyramidColumns(row: WorkoutRow): PyramidColumns {
  if (row.type !== 'pyramids') {
    return [null, null];
  }

  return [row.mode, JSON.stringify(row.layers)];
}

function toRow(stored: StoredRow): WorkoutRow {
  if (stored.type !== 'pyramids') {
    return stored;
  }

  return { ...stored, layers: JSON.parse(stored.layers) as LayerSec[] };
}
```

Class changes:

```ts
  async listByUser(userId: UserId): Promise<WorkoutRow[]> {
    const result = await this.db
      .prepare('SELECT * FROM workouts WHERE user_id = ? ORDER BY created_at DESC')
      .bind(userId)
      .all<StoredRow>();

    return result.results.map((stored) => toRow(stored));
  }

  async findById(id: WorkoutId): Promise<WorkoutRow | null> {
    const stored = await this.db
      .prepare('SELECT * FROM workouts WHERE id = ?')
      .bind(id)
      .first<StoredRow>();

    return stored == null ? null : toRow(stored);
  }
```

`insert`: append `, mode, layers` after `burst_max_sec` in the column list, add two `?` (16 placeholders total), and `...pyramidColumns(row)` after `...randomColumns(row)` in `.bind`. `update`: `..., burst_max_sec = ?, mode = ?, layers = ?, updated_at = ? WHERE id = ?` with the same spread after `...randomColumns(row)`.

- [ ] **Step 4: Run all backend tests.** `node --import tsx --test test/workouts.db.test.ts test/workouts.service.test.ts`. Expected: PASS.

- [ ] **Step 5: Gates.** `npm run typecheck && npm run lint && npm test`. Expected: all PASS. Fix any lint issues (explicit return types, no single-letter names; the `(_, index)` placeholder in the 50-layer test is an unused-arg name, rename to `(unused, index)` if lint complains).

- [ ] **Step 6: Manual API check** (`npx wrangler dev`, local DB with 0004 applied, logged-in cookie):
  - POST valid normal pyramid -> 201 with `layers` array.
  - POST hard with `rest_sec` 16 and `layers [20,40,60]` -> 400 `rest_too_close_to_work`.
  - GET list -> `layers` is an array for the pyramid, emom/intervals/random unchanged.
  - PUT pyramid to emom -> 200; DELETE -> 200.

- [ ] **Step 7: Commit (after `/crit`)**

```bash
git add src test
git commit -m "feat(workouts): accept pyramids workouts"
```

---

## PR C - web

Needs only the API contract. Can be built in parallel with PR B; merge and deploy after B.

### Task 6: frontend wiring

**Files:**
- Modify: `public/js/app.js` (`setType` ~L261, `ERROR_MESSAGES` ~L186, `workoutItem` ~L90, `openForm` ~L454, submit handler pyramids branch ~L520)
- Modify: `public/sw.js` (`CACHE`)

**Interfaces:**
- Consumes: API payload `{ type: 'pyramids', name, mode, layers, rest_sec, warning_lead_sec }` from `pyramidWorkout()`; rows from `GET /api/workouts` have the same fields.

- [ ] **Step 1: `setType`** replace

```js
  const runOnly = !loggedIn || type === 'pyramids';
```
with
```js
  const runOnly = !loggedIn;
```

- [ ] **Step 2: Submit handler, pyramids branch.** Replace `openRunner(pyramid); return;` with:

```js
    if (!loggedIn) {
      openRunner(pyramid);

      return;
    }

    await saveWorkout({ ...pyramid, name: byId('w-name').value.trim() });

    return;
```
(`pyramidWorkout()` defaults the name to `Workout` for guests; logged-in users have the name input `required`, and the server rejects blank with `name_required`, shown through `errorMessage`.)

- [ ] **Step 3: `ERROR_MESSAGES`** add:

```js
  mode_invalid: 'Choose Normal or Hard mode',
  layers_invalid: 'Add your layers',
  rest_too_close_to_work: 'Rest must be at least 5 seconds shorter than the first layer',
```

- [ ] **Step 4: `workoutItem`** add a branch before the final `else`:

```js
  } else if (workout.type === 'pyramids') {
    const modeLabel = workout.mode === 'hard' ? 'Hard' : 'Normal';

    summary = `${workout.layers.length} layers (${workout.layers[0]}-${workout.layers.at(-1)}s) · ${modeLabel} · ${formatClock(total)}`;
  } else {
```

- [ ] **Step 5: `openForm`** change `const timed = workout != null && type !== 'random';` to `const timed = workout != null && type !== 'random' && type !== 'pyramids';`, and after the `resetPyramidRows(DEFAULT_PYRAMID_LAYERS)` block and the `leadInput` assignment add:

```js
  if (workout != null && type === 'pyramids') {
    pyramidMode = workout.mode;
    pyramidRestInput.value = String(workout.mode === 'hard' ? workout.rest_sec : DEFAULT_PYRAMID_REST_SEC);
    resetPyramidRows(workout.layers);
    leadInput.value = String(workout.warning_lead_sec);
  }
```
Placement note: this must run after the defaults are applied (`leadInput.value = ...` for `timed` rows runs before) so the saved lead wins, and before `setType(type)`.

- [ ] **Step 6: `public/sw.js`** bump `emom-shell-v10` to `emom-shell-v11`.

- [ ] **Step 7: Automated gates.** `npm test && npm run lint`. Expected: PASS (existing `test/pyramids.test.js`, `schedule.test.js`, `timer-chunks.test.js` unchanged).

- [ ] **Step 8: Manual browser check** (`npx wrangler dev --port 8787` with 0004 applied locally and PR B code present):
  - Guest: Pyramids tab says `Start`, runs, no API call.
  - Logged in: `Save` and name required on all four types.
  - Save a normal 10/20/30 and a hard 20/40/60 rest 15; list shows `3 layers (10-30s) · Normal · 2:50` and the hard summary.
  - Hard-save error from server (force by editing request) shows a readable message, not a raw code.
  - Reload, Edit each: mode toggle, layer rows, shared rest, lead slider all prefilled; change and save; list updates.
  - Run from list: header `name · Pyramids · N layers · mm:ss`, step labels, total matches the list.
  - Edit an existing EMOM and Random row: unaffected.
  - Delete a pyramid.
  - Service worker: hard reload picks up `v11`.

- [ ] **Step 9: Commit (after `/crit`)**

```bash
git add public
git commit -m "feat(pyramids): save and edit pyramids for logged-in users"
```

---

## Phase 3 - rollout order

1. Merge PR A, run Task 2 against production (backup, migrate, verify).
2. Merge PR B, deploy Worker.
3. Merge PR C, deploy (assets ship with the Worker; if B and C deploy together, still apply the migration first).
4. Smoke test on production: create, list, edit, run, delete a pyramid; confirm an existing EMOM still loads.

## Self-review notes

- Spec coverage: migration (Task 1, 2), brands (3), service validation incl. every code (4), db JSON boundary (5), frontend label/submit/list/edit/run/sw (6), tests (4, 5, manual 6), size and split (top).
- Type names consistent across tasks: `PyramidsWorkoutRow`, `PyramidsInput`, `PyramidsClean`, `makeLayerSec`, `makePyramidMode`, `makePyramidRestSec`, `validatePyramids`, `pyramidColumns`, `toRow`, `StoredRow`.
- Known runtime quirk: non-pyramid rows from `SELECT *` carry `mode: null, layers: null` in API responses; harmless, the web only reads them for `type === 'pyramids'`.
