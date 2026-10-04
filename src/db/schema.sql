CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, -- PHC-style: pbkdf2$<iterations>$<salt>$<derived>
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workouts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'emom',  -- 'emom' | 'intervals' | 'random'
  rounds INTEGER,                     -- NULL for random
  work_sec INTEGER,                   -- EMOM: interval length; Intervals: work phase; NULL for random
  rest_sec INTEGER NOT NULL DEFAULT 0, -- 0 for EMOM and random
  warning_lead_sec INTEGER NOT NULL,  -- 0 for random
  total_sec INTEGER,                  -- random only
  min_rest_sec INTEGER,               -- random only
  burst_min_sec INTEGER,              -- random only
  burst_max_sec INTEGER,              -- random only
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workouts_user ON workouts(user_id);
