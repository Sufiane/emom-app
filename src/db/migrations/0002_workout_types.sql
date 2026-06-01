-- Generalize workouts from EMOM-only to typed work/rest workouts.
ALTER TABLE workouts ADD COLUMN type TEXT NOT NULL DEFAULT 'emom';
ALTER TABLE workouts ADD COLUMN rounds INTEGER;
ALTER TABLE workouts ADD COLUMN work_sec INTEGER;
ALTER TABLE workouts ADD COLUMN rest_sec INTEGER NOT NULL DEFAULT 0;

UPDATE workouts SET work_sec = interval_sec WHERE work_sec IS NULL;
UPDATE workouts SET rounds = total_duration_sec / interval_sec WHERE rounds IS NULL;

ALTER TABLE workouts DROP COLUMN interval_sec;
ALTER TABLE workouts DROP COLUMN total_duration_sec;
