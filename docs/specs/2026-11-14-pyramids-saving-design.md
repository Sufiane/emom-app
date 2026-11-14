# Pyramids: save for logged-in users - design

Date: 2026-11-14
Status: draft for coordinator review (open questions at the bottom carry recommended defaults).
Follows: `docs/specs/2026-11-14-pyramids-timer-design.md` (slice 1, run-only, deployed) and the shape of `docs/specs/2026-10-04-random-hiit-save-design.md`.

## Problem

Pyramids is run-only. For a logged-in user the form shows `Start`, never calls the API, and the backend rejects `type: 'pyramids'` with `type_invalid`. Users cannot save, list, edit or re-run a pyramid.

## Goal

Logged-in users create, list, edit, run and delete pyramids. Guests keep quick-run unchanged. Only the config is stored; steps are derived at runtime by `stepsOf` (slice 1 data model, no rework).

## Data model

Workout payload and API shape (request and response):

```
{ type: 'pyramids', name, mode: 'normal'|'hard', layers: [work_sec, ...], rest_sec, warning_lead_sec }
```

Row mapping in `workouts`:

| Column | Pyramids value |
|---|---|
| `type` | `'pyramids'` |
| `rounds`, `work_sec` | NULL |
| `rest_sec` | shared rest in hard mode, `0` in normal mode |
| `warning_lead_sec` | real value (NOT NULL column, 3-15 via existing brand) |
| `mode` (new, nullable TEXT) | `'normal'` or `'hard'`, NULL for other types |
| `layers` (new, nullable TEXT) | JSON array of ints, e.g. `[10,20,30]`, NULL for other types |
| random columns | NULL |

`layers` is JSON text in D1. Serialisation (write) and parse (read) live only in `workouts.db.ts`; the service and API see `number[]`.

## Production migration (the risky part)

Facts from the repo:

- No migration runner is configured (`wrangler.jsonc` has no `migrations_dir`; `package.json` has only `db:local` / `db:remote` that execute `schema.sql`). Migrations in `src/db/migrations/` are applied by hand with `wrangler d1 execute emom-app --remote --file=...`.
- `schema.sql` uses `CREATE TABLE IF NOT EXISTS`, so `npm run db:remote` is a no-op on the existing table. It does NOT add columns. `schema.sql` is only the source of truth for fresh databases.
- No `CHECK` constraint exists on `type` anywhere (`0002_workout_types.sql` added it via `ALTER ... ADD COLUMN ... DEFAULT 'emom'`, no CHECK; `random` shipped later with no migration for the type value). So a new `type` value needs no table rebuild.
- `rounds` and `work_sec` are nullable (added nullable by 0002, rewritten nullable in `schema.sql`). `warning_lead_sec` is NOT NULL, which pyramids satisfies with a real value.

Decision: additive migration `src/db/migrations/0004_pyramids_workouts.sql`:

```sql
ALTER TABLE workouts ADD COLUMN mode TEXT;
ALTER TABLE workouts ADD COLUMN layers TEXT;
```

No rebuild, no data rewrite, existing rows get NULL. Same approach as random (0003).

Rollout order matters:

1. Preflight on remote (read-only): `PRAGMA table_info(workouts)` must show the four random columns and NOT show `mode`/`layers`; `SELECT sql FROM sqlite_master WHERE name = 'workouts'` must show no CHECK.
2. Take a backup: `wrangler d1 export emom-app --remote --output=<path outside repo>`. D1 Time Travel is also available as a rollback path.
3. Apply `0004` to remote BEFORE deploying the Worker. The old Worker is unaffected by extra NULL columns (`SELECT *` returns them, the web ignores them), so the migration is safe on its own and reversible by not deploying.
4. Deploy the Worker (assets and API ship in one `wrangler deploy`).
5. Rollback after deploy: redeploy the previous Worker. Columns can stay. Pyramid rows already saved would render wrongly in the old frontend (treated as EMOM with null fields), so delete them first if rolling back for real.

Re-running 0004 fails with "duplicate column name"; it is not idempotent and not tracked, so record in the PR that it was applied. Local dev databases created before this change need the file applied with `--local`.

## Backend (hexagonal, branded)

- `workouts.db.ts`: add `PyramidsWorkoutRow` (type `'pyramids'`, `rounds: null`, `work_sec: null`, `rest_sec: 0 | PyramidRestSec`, `mode: PyramidMode`, `layers: LayerSec[]`, `warning_lead_sec: WarningLeadSec`); widen `WorkoutType` and `WorkoutRow`. `insert`/`update` bind `mode` and `JSON.stringify(layers)` (NULL for other types). Reads (`listByUser`, `findById`) go through one private `toRow` that parses `layers` when `type === 'pyramids'`. This is the only file that touches JSON text and the only place casts to brands from ORM output. The db never throws domain errors.
- New brands in `src/lib/brand/`, each a validating constructor throwing snake_case codes, no logging, no barrel:
  - `pyramid-mode.ts` -> `PyramidMode`, `makePyramidMode(value)`; code `mode_invalid`.
  - `layer-sec.ts` -> `LayerSec`, 5-600 whole seconds; non-integer or out of range both throw `work_out_of_range` (mirrors frontend `validatePyramid`, which has one code for both).
  - `pyramid-rest-sec.ts` -> `PyramidRestSec`, whole seconds >= 1; non-integer or `< 1` throws `rest_out_of_range` (mirrors frontend).
- `workouts.service.ts`: `PyramidsInput`, `PyramidsClean`, `validatePyramids`, wired into the `validateInput` switch. Order and codes mirror `public/js/pyramids.js` `validatePyramid`:
  1. `layers` must be an array, else `layers_invalid`.
  2. `layers_too_few` (fewer than 3).
  3. `work_out_of_range` (any layer, via `makeLayerSec`).
  4. `layers_not_ascending` (any layer `<=` previous).
  5. Hard mode only: `rest_out_of_range`, then `rest_too_close_to_work` (`rest > layers[0] - 5`).
  6. Normal mode: `rest_sec` must be `0` or absent, else `rest_sec_must_be_zero` (same rule as EMOM). Stored as `0`.
  7. `warning_lead_sec` via existing `makeWarningLeadSec` (3-15), then `lead_too_long` if `lead >= shortest segment`, where shortest = `layers[0]` in normal mode, `min(layers[0], rest)` in hard mode (equivalent to the frontend `stepsOf` minimum because layers ascend).
  - Mode is read first (`makePyramidMode`) so hard-only rules branch on it.
- Duplicated rules, so keep both sides in sync with matching test vectors (frontend is untyped JS and cannot be imported by the TS backend). One deliberate difference: the backend also enforces the 3-15 lead range (existing brand); the slider already limits the frontend.
- Routes unchanged. `WorkoutInput` gains `PyramidsInput`.
- Update path: switching an existing row to pyramids, or from pyramids to another type, works because `insert`/`update` always write all optional columns (NULL when not applicable).

## Frontend (`public/js/app.js`, `public/sw.js`)

- `setType`: `runOnly = !loggedIn` (drop the `|| type === 'pyramids'` exception). Logged-in users see `Save` and a required name on every type including pyramids; guests keep `Start`.
- Submit, pyramids branch: validate with `validatePyramid` (unchanged); guests -> `openRunner(pyramid)` (unchanged, name defaults to `Workout`); logged-in -> `saveWorkout({ ...pyramid, name })` with the trimmed name, using the existing create/update path and `renderList()`. `pyramidWorkout()` already returns the exact API payload.
- `ERROR_MESSAGES`: add `mode_invalid`, `layers_invalid`, `rest_too_close_to_work` (generic text, since server errors have no workout context). `layers_too_few`, `layers_not_ascending`, `work_out_of_range`, `rest_out_of_range`, `lead_too_long` already exist.
- `workoutItem`: pyramids summary `N layers (a-bs) · mode · mm:ss`, e.g. `3 layers (10-30s) · Normal · 2:50`. Type label already `Pyramids`.
- `openForm(workout)`: `timed` must exclude pyramids (today `type !== 'random'` would read `work_sec`/`rounds` as null for a pyramid). For a pyramid row: `pyramidMode = workout.mode`, `resetPyramidRows(workout.layers)`, `pyramidRestInput.value = workout.rest_sec` in hard mode (default otherwise), `leadInput.value = workout.warning_lead_sec`. Existing `setType` then syncs layer rows and mode toggle.
- Run from list: `openRunner(workout)` already works with a row because slice 1 runs from the same shape (`stepsOf`, `workoutTotalSeconds`, `initialClockSeconds`, `phaseLabel`). Verify manually; no change expected.
- `public/sw.js`: bump `emom-shell-v10` -> `v11` (`app.js` changed).

## Testing

- `test/workouts.service.test.ts` (extend, nested `describe` per condition): valid normal and hard pyramid (stored fields, `rest_sec` 0 in normal, name trimmed); every code above including boundaries (3 layers ok, 2 rejected, equal layers rejected, hard rest exactly `layers[0]-5` ok, one above rejected, `layers[0]=5` hard rejected, lead equal to shortest rejected, lead one below shortest ok); invalid mode; non-array layers; normal with `rest_sec` 30 rejected; update changing emom -> pyramids and pyramids -> emom; cross-user update still 404; emom/intervals/random regression untouched.
- `test/workouts.db.test.ts` (new): fake `D1Database` capturing `prepare`/`bind`; asserts a pyramid row binds `JSON.stringify(layers)` and mode, other types bind NULL for both, and a stored pyramid row read back returns `layers` as an array while non-pyramid rows pass through.
- Frontend: no DOM test harness exists; manual browser check: guest quick-run unchanged, login shows `Save`, save, list summary, reload, edit round-trip (mode, layers, shared rest, lead), run from list, delete, edit an existing EMOM row unaffected.
- Gates: `npm run typecheck`, `npm run lint`, `npm test`.

## Size and split

Estimated about 460 lines of code, SQL and tests plus about 920 lines of docs (spec plus plan) (about 1,400 total; details and per-PR sizes in the plan). Layers: schema, backend, web. The plan proposes docs-only, then migration, then backend, then web, because of the migration risk and the one-layer-per-PR rule.

## Out of scope

Presets, per-layer rest, non-mirror descents, a max-layer cap (see open question 3), migration runner tooling, a TS import of `pyramids.js` for rule sharing.

## Open questions (recommended default first)

1. Storage: two additive columns (`mode TEXT`, `layers TEXT` JSON) vs one `config` JSON blob. Default: two columns, matching the follow-up note in the slice 1 spec and the typed-column convention.
2. Backend code for lead check: `lead_too_long` (mirrors `validatePyramid`; message already mapped) vs existing `warning_lead_too_long`. Default: `lead_too_long` for pyramids.
3. Layer count cap. Slice 1 says no max. A caller can post a huge array (bounded only by request size and D1's 2 MB row limit); impact is limited to their own account but the runner would build a very long timeline. Default: no cap now, add a follow-up ticket if abuse or a UI problem appears. Adding a backend-only cap would reject payloads the frontend accepts.
4. Normal mode with non-zero `rest_sec`: strict reject (`rest_sec_must_be_zero`, like EMOM) vs silently store 0. Default: strict.
5. Corrupt `layers` JSON on read (cannot happen via the service): let `JSON.parse` throw (500) vs skip the row. Default: throw; skipping hides data loss and the service is the only writer.
6. Ticket split: migration, backend, web as separate PRs, docs-only PR first (four small PRs) vs fewer. Default: keep the migration separate and apply it to prod before the backend deploys.
