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
  type TEXT NOT NULL DEFAULT 'emom',  -- 'emom' | 'intervals'
  rounds INTEGER NOT NULL,
  work_sec INTEGER NOT NULL,          -- EMOM: interval length; Intervals: work phase
  rest_sec INTEGER NOT NULL DEFAULT 0, -- 0 for EMOM
  warning_lead_sec INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workouts_user ON workouts(user_id);
