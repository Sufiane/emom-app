# Random HIIT save - implementation plan

Spec: `docs/specs/2026-10-04-random-hiit-save-design.md`. DECISION (user-approved): additive migration, no table rebuild, no separate table. Random rows store `warning_lead_sec = 0` and `rest_sec = 0`; `rounds`/`work_sec` are NULL for random. The existing `type` column simply gains the value `'random'` (no new column). Anywhere below that says rebuild or NULL warning lead is superseded by this. Commits use conventional-commit subjects.

## Phase 0 - confirm the schema (no code)

- [ ] Run `PRAGMA table_info(workouts)` against local and remote D1; record which of `rounds`, `work_sec`, `warning_lead_sec` are NOT NULL.
- [ ] Additive migration chosen. If `rounds`/`work_sec` turn out NOT NULL in remote, stop and report to the coordinator.

## Phase 1 - backend (independent of frontend)

1. [ ] `src/db/migrations/0003_random_workouts.sql` + `src/db/schema.sql`: four `ALTER TABLE workouts ADD COLUMN ... INTEGER` statements (`total_sec`, `min_rest_sec`, `burst_min_sec`, `burst_max_sec`); rewrite `schema.sql` to match the real table (nullable `rounds`/`work_sec`, the four new columns, type comment incl. 'random'). Verify with `npm run db:local` on a scratch DB seeded with one emom and one intervals row; rows survive unchanged.
   Commit: `feat(db): add random workout columns`
2. [ ] Brands: `src/lib/brand/total-sec.ts`, `min-rest-sec.ts`, `burst-sec.ts` (validating constructors, snake_case error codes, no logging, no barrel).
   Commit: `feat(workouts): add random workout brands`
3. [ ] `workouts.db.ts`: widen `WorkoutType`, add `RandomWorkoutRow`, update `insert`/`update` SQL and bindings (NULL for non-applicable columns).
4. [ ] `workouts.service.ts`: add `RandomClean` + `validateRandom`; restructure `validateInput` so `makeRounds`/`makeWarningLeadSec` only run for emom/intervals; update the 400 message to list all three types; enforce burst range and feasibility rules. Mark `private readonly db` while touching the constructor.
   Commit: `feat(workouts): accept random workouts`
5. [ ] `npm run typecheck && npm run lint`; manual `wrangler dev` with curl: POST valid random (201), POST burst_min > burst_max (400), POST too-short total (400), emom/intervals regression, GET list returns the new fields, PUT edit, DELETE.

## Phase 2 - frontend (needs only the API contract: payload fields `type: 'random'`, `total_sec`, `min_rest_sec`, `burst_min_sec`, `burst_max_sec`)

1. [ ] `public/js/app.js` `setType()`: label `Save` / required name for logged-in on all types.
2. [ ] Submit handler: random branch saves via API when logged in, runs when guest.
3. [ ] `openForm()`: populate random inputs when editing a random row.
4. [ ] `workoutItem()`: random summary + `Random HIIT` label.
5. [ ] `public/sw.js`: bump `emom-shell-v6` -> `v7`.
6. [ ] `npm test` (existing `test/random-hiit.test.js` must still pass), `npm run lint`.
7. [ ] Manual browser: save, reload, list shows summary, Edit round-trips values, Run from list uses saved config, guest quick-run unchanged, delete.
   Commit: `feat(random-hiit): save random workouts for logged-in users`

## Phase 3 - rollout

- [ ] Apply migration to remote D1 (`wrangler d1 execute emom-app --remote --file=src/db/migrations/0003_random_workouts.sql`) before deploying the Worker.
- [ ] Stage changes and stop for `/crit` review before committing.
