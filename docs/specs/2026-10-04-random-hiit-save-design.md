# Random HIIT: save for logged-in users - design

Status: approved. Amended: additive migration (4 nullable ADD COLUMNs), `warning_lead_sec` stored as 0 for random, `type` column gains 'random'. The table-rebuild section below is superseded.

## Bug

Logged-in user picks the "Random HIIT" tab, fills the form, and cannot save. There is no Save button, and nothing is ever sent to the API.

## Root cause

Not a regression in the save path. Saving was deliberately left out of v1 (`docs/specs/2026-10-04-random-hiit-design.md`, decision 9 and "Out of scope"), but nothing tells the user. Specifics:

1. `public/js/app.js` `setType()` forces the submit label to `Start` for `random` even when logged in, and the submit handler's `currentType === 'random'` branch calls `openRunner(...)` and returns before `api.createWorkout` / `api.updateWorkout`. The form can only run, never save.
2. Backend rejects the type anyway. `src/modules/workouts/workouts.service.ts` `validateInput` throws 400 `type must be "emom" or "intervals"` for anything else. `WorkoutType` in `workouts.db.ts` and the `WorkoutRow` union have no `random` member.
3. Schema cannot hold it. `src/db/schema.sql` `workouts` has `rounds`, `work_sec`, `warning_lead_sec` NOT NULL and no columns for `total_sec`, `min_rest_sec`, `burst_min_sec`, `burst_max_sec`. `src/db/migrations/0002_workout_types.sql` only covers emom/intervals.
4. Load-back would also be wrong. `workoutItem()` in `app.js` treats any non-`intervals` type as EMOM (`rounds x work_sec`), `openForm()` never fills the random fields (always resets to defaults), and `workoutTotalSeconds` for a random row only works if `total_sec` is present on the row.

## Goal

Logged-in users can create, list, edit, run, and delete Random HIIT workouts. Guests keep the quick-run flow unchanged. Only the config is saved; the burst schedule is still generated fresh at every Start.

## Design

### Data model

New migration `src/db/migrations/0003_random_workouts.sql` plus matching `schema.sql`. SQLite cannot drop NOT NULL in place, so rebuild the table (create `workouts_new`, copy, drop, rename, recreate `idx_workouts_user`):

- `rounds`, `work_sec`, `warning_lead_sec` become nullable (NULL for random).
- Add nullable `total_sec`, `min_rest_sec`, `burst_min_sec`, `burst_max_sec` (INTEGER).
- `type` comment becomes `'emom' | 'intervals' | 'random'`.
- `rest_sec` stays `NOT NULL DEFAULT 0`; random rows store 0.

Why not reuse existing columns (e.g. rounds = burst count): the meanings do not match, and it silently breaks list/summary code. Why not a JSON blob: loses the typed-column convention used by the other two types.

### Backend (hexagonal, branded types)

- `workouts.db.ts`: add `RandomWorkoutRow` (type `'random'`, four new fields, branded), widen `WorkoutType` and `WorkoutRow`; `insert`/`update` SQL write the new columns (NULL where not applicable); ORM boundary is the only place that casts reads to brands.
- New brands in `src/lib/brand/`: `total-sec.ts` (whole seconds, 60-3600), `min-rest-sec.ts` (5-120), `burst-sec.ts` (5-120, used for both min and max). Validating constructors throw snake_case codes as the other brands do.
- `workouts.service.ts`: `validateRandom` builds `RandomClean`; enforces `burst_min <= burst_max` and `floor((total - rest) / (burstMin + rest)) >= 1` (same rules as frontend `validateRandomConfig`); ignores `rounds`/`work_sec`/`warning_lead_sec`/`rest_sec` for random. `validateInput` must stop calling `makeRounds`/`makeWarningLeadSec` before branching on type.
- Rules duplicated from `public/js/random-hiit.js` (frontend is untyped JS, backend cannot import it). Keep both in sync via matching test vectors.
- No route changes; `WorkoutInput` gains optional `total_sec`, `min_rest_sec`, `burst_min_sec`, `burst_max_sec`.

### Frontend

- `setType()`/`openForm()`: submit label is `Save` for logged-in users on every type; guests keep `Start`. Name required when logged in for every type.
- Submit handler: random branch validates with `validateRandomConfig`, then guests -> `openRunner`, logged-in -> `api.createWorkout` / `api.updateWorkout` with `{ name, type: 'random', total_sec, min_rest_sec, burst_min_sec, burst_max_sec }`, then `renderList()`.
- `openForm(workout)`: when editing a random row, populate the four inputs (`total_sec / 60` for minutes) instead of resetting to defaults.
- `workoutItem()`: third summary branch `Random HIIT - mm:ss - bursts a-bs - rest >= Ns`; type label `Random HIIT`.
- `public/sw.js`: bump cache version since `app.js` changes.

## Testing

- Backend: no test runner covers `src/` today. Add `test/workouts-random.test.js`-style unit tests only if a TS test path exists; otherwise validate via `npm run typecheck` and `npm run lint` and a manual `wrangler dev` round trip (create, list, edit, run, delete).
- Frontend: manual browser check of save, reload, edit, run from list.

## Open questions

1. Persist as proposed (table rebuild migration)? D1 table rebuild on production data is the riskiest step. Alternative: skip persistence and instead hide the logged-in "Save" expectation, i.e. keep random as quick-run only and make that explicit in the UI.
2. Is production `workouts` already missing NOT NULL on `rounds`/`work_sec` (migration 0002 added them nullable) while `warning_lead_sec` is NOT NULL? Needs `wrangler d1 execute emom-app --remote --command "PRAGMA table_info(workouts)"` before choosing between rebuild and a lighter migration.
3. Should warning lead matter for random? Currently not used; stored NULL.
