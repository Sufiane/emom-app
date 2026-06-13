import type { EmomIntervalSec } from '../../lib/brand/emom-interval-sec';
import type { RestPhaseSec } from '../../lib/brand/rest-phase-sec';
import type { Rounds } from '../../lib/brand/rounds';
import type { UnixMs } from '../../lib/brand/unix-ms';
import type { UserId } from '../../lib/brand/user-id';
import type { WarningLeadSec } from '../../lib/brand/warning-lead-sec';
import type { WorkPhaseSec } from '../../lib/brand/work-phase-sec';
import type { WorkoutId } from '../../lib/brand/workout-id';
import type { WorkoutName } from '../../lib/brand/workout-name';

export type WorkoutType = 'emom' | 'intervals';

type WorkoutBase = {
  id: WorkoutId;
  user_id: UserId;
  name: WorkoutName;
  rounds: Rounds;
  warning_lead_sec: WarningLeadSec;
  created_at: UnixMs;
  updated_at: UnixMs;
};

export type EmomWorkoutRow = WorkoutBase & {
  type: 'emom';
  work_sec: EmomIntervalSec;
  rest_sec: 0;
};

export type IntervalsWorkoutRow = WorkoutBase & {
  type: 'intervals';
  work_sec: WorkPhaseSec;
  rest_sec: RestPhaseSec;
};

export type WorkoutRow = EmomWorkoutRow | IntervalsWorkoutRow;

export class WorkoutsDb {
  constructor(private db: D1Database) {}

  async listByUser(userId: UserId): Promise<WorkoutRow[]> {
    const result = await this.db
      .prepare('SELECT * FROM workouts WHERE user_id = ? ORDER BY created_at DESC')
      .bind(userId)
      .all<WorkoutRow>();

    return result.results;
  }

  findById(id: WorkoutId): Promise<WorkoutRow | null> {
    return this.db
      .prepare('SELECT * FROM workouts WHERE id = ?')
      .bind(id)
      .first<WorkoutRow>();
  }

  async insert(row: WorkoutRow): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO workouts (id, user_id, name, type, rounds, work_sec, rest_sec, warning_lead_sec, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        row.id,
        row.user_id,
        row.name,
        row.type,
        row.rounds,
        row.work_sec,
        row.rest_sec,
        row.warning_lead_sec,
        row.created_at,
        row.updated_at
      )
      .run();
  }

  async update(row: WorkoutRow): Promise<void> {
    await this.db
      .prepare(
        'UPDATE workouts SET name = ?, type = ?, rounds = ?, work_sec = ?, rest_sec = ?, warning_lead_sec = ?, updated_at = ? WHERE id = ?'
      )
      .bind(
        row.name,
        row.type,
        row.rounds,
        row.work_sec,
        row.rest_sec,
        row.warning_lead_sec,
        row.updated_at,
        row.id
      )
      .run();
  }

  async deleteById(id: WorkoutId): Promise<void> {
    await this.db.prepare('DELETE FROM workouts WHERE id = ?').bind(id).run();
  }
}
