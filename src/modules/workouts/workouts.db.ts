import type { BurstSec } from '../../lib/brand/burst-sec';
import type { EmomIntervalSec } from '../../lib/brand/emom-interval-sec';
import type { LayerSec } from '../../lib/brand/layer-sec';
import type { MinRestSec } from '../../lib/brand/min-rest-sec';
import type { PyramidMode } from '../../lib/brand/pyramid-mode';
import type { PyramidRestSec } from '../../lib/brand/pyramid-rest-sec';
import type { RestPhaseSec } from '../../lib/brand/rest-phase-sec';
import type { Rounds } from '../../lib/brand/rounds';
import type { TotalSec } from '../../lib/brand/total-sec';
import type { UnixMs } from '../../lib/brand/unix-ms';
import type { UserId } from '../../lib/brand/user-id';
import type { WarningLeadSec } from '../../lib/brand/warning-lead-sec';
import type { WorkPhaseSec } from '../../lib/brand/work-phase-sec';
import type { WorkoutId } from '../../lib/brand/workout-id';
import type { WorkoutName } from '../../lib/brand/workout-name';

export type WorkoutType = 'emom' | 'intervals' | 'random' | 'pyramids';

type WorkoutBase = {
  id: WorkoutId;
  user_id: UserId;
  name: WorkoutName;
  created_at: UnixMs;
  updated_at: UnixMs;
};

export type EmomWorkoutRow = WorkoutBase & {
  type: 'emom';
  rounds: Rounds;
  warning_lead_sec: WarningLeadSec;
  work_sec: EmomIntervalSec;
  rest_sec: 0;
};

export type IntervalsWorkoutRow = WorkoutBase & {
  type: 'intervals';
  rounds: Rounds;
  warning_lead_sec: WarningLeadSec;
  work_sec: WorkPhaseSec;
  rest_sec: RestPhaseSec;
};

export type RandomWorkoutRow = WorkoutBase & {
  type: 'random';
  rounds: null;
  work_sec: null;
  rest_sec: 0;
  warning_lead_sec: 0;
  total_sec: TotalSec;
  min_rest_sec: MinRestSec;
  burst_min_sec: BurstSec;
  burst_max_sec: BurstSec;
};

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

type RandomColumns = [number | null, number | null, number | null, number | null];

function randomColumns(row: WorkoutRow): RandomColumns {
  if (row.type !== 'random') {
    return [null, null, null, null];
  }

  return [row.total_sec, row.min_rest_sec, row.burst_min_sec, row.burst_max_sec];
}

export class WorkoutsDb {
  constructor(private readonly db: D1Database) {}

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

  async insert(row: WorkoutRow): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO workouts (id, user_id, name, type, rounds, work_sec, rest_sec, warning_lead_sec, total_sec, min_rest_sec, burst_min_sec, burst_max_sec, mode, layers, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
        ...randomColumns(row),
        ...pyramidColumns(row),
        row.created_at,
        row.updated_at
      )
      .run();
  }

  async update(row: WorkoutRow): Promise<void> {
    await this.db
      .prepare(
        'UPDATE workouts SET name = ?, type = ?, rounds = ?, work_sec = ?, rest_sec = ?, warning_lead_sec = ?, total_sec = ?, min_rest_sec = ?, burst_min_sec = ?, burst_max_sec = ?, mode = ?, layers = ?, updated_at = ? WHERE id = ?'
      )
      .bind(
        row.name,
        row.type,
        row.rounds,
        row.work_sec,
        row.rest_sec,
        row.warning_lead_sec,
        ...randomColumns(row),
        ...pyramidColumns(row),
        row.updated_at,
        row.id
      )
      .run();
  }

  async deleteById(id: WorkoutId): Promise<void> {
    await this.db.prepare('DELETE FROM workouts WHERE id = ?').bind(id).run();
  }
}
