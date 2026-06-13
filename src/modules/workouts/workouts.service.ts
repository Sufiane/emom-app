import { HTTPException } from 'hono/http-exception';
import { randomId } from '../../lib/crypto';
import { makeEmomIntervalSec, type EmomIntervalSec } from '../../lib/brand/emom-interval-sec';
import { makeRestPhaseSec, type RestPhaseSec } from '../../lib/brand/rest-phase-sec';
import { makeRounds, type Rounds } from '../../lib/brand/rounds';
import { nowMs } from '../../lib/brand/unix-ms';
import type { UserId } from '../../lib/brand/user-id';
import { makeWarningLeadSec, type WarningLeadSec } from '../../lib/brand/warning-lead-sec';
import { makeWorkPhaseSec, type WorkPhaseSec } from '../../lib/brand/work-phase-sec';
import { makeWorkoutId, type WorkoutId } from '../../lib/brand/workout-id';
import { makeWorkoutName, type WorkoutName } from '../../lib/brand/workout-name';
import { WorkoutsDb, type WorkoutRow, type WorkoutType } from './workouts.db';

export type WorkoutInput = {
  name: unknown;
  type: WorkoutType;
  rounds: unknown;
  work_sec: unknown;
  rest_sec: unknown;
  warning_lead_sec: unknown;
};

type EmomClean = {
  name: WorkoutName;
  type: 'emom';
  rounds: Rounds;
  work_sec: EmomIntervalSec;
  rest_sec: 0;
  warning_lead_sec: WarningLeadSec;
};

type IntervalsClean = {
  name: WorkoutName;
  type: 'intervals';
  rounds: Rounds;
  work_sec: WorkPhaseSec;
  rest_sec: RestPhaseSec;
  warning_lead_sec: WarningLeadSec;
};

type CleanInput = EmomClean | IntervalsClean;

export class WorkoutsService {
  constructor(private db: WorkoutsDb) {}

  list(userId: UserId): Promise<WorkoutRow[]> {
    return this.db.listByUser(userId);
  }

  async create(userId: UserId, input: WorkoutInput): Promise<WorkoutRow> {
    const clean = validateInput(input);
    const now = nowMs();
    const row: WorkoutRow = {
      id: makeWorkoutId(randomId()),
      user_id: userId,
      ...clean,
      created_at: now,
      updated_at: now
    };

    await this.db.insert(row);

    return row;
  }

  async update(userId: UserId, id: WorkoutId, input: WorkoutInput): Promise<WorkoutRow> {
    const existing = await this.owned(userId, id);
    const clean = validateInput(input);
    const row: WorkoutRow = {
      id: existing.id,
      user_id: existing.user_id,
      created_at: existing.created_at,
      ...clean,
      updated_at: nowMs()
    };

    await this.db.update(row);

    return row;
  }

  async remove(userId: UserId, id: WorkoutId): Promise<void> {
    await this.owned(userId, id);
    await this.db.deleteById(id);
  }

  private async owned(userId: UserId, id: WorkoutId): Promise<WorkoutRow> {
    const existing = await this.db.findById(id);

    if (existing == null || existing.user_id !== userId) {
      throw new HTTPException(404, { message: 'workout not found' });
    }

    return existing;
  }
}

function validateInput(input: WorkoutInput): CleanInput {
  const name = makeWorkoutName(input.name);

  if (input.type !== 'emom' && input.type !== 'intervals') {
    throw new HTTPException(400, { message: 'type must be "emom" or "intervals"' });
  }

  const rounds = makeRounds(input.rounds);
  const warningLead = makeWarningLeadSec(input.warning_lead_sec);

  if (input.type === 'emom') {
    return validateEmom(name, rounds, warningLead, input.work_sec, input.rest_sec);
  }

  return validateIntervals(name, rounds, warningLead, input.work_sec, input.rest_sec);
}

function validateEmom(
  name: WorkoutName,
  rounds: Rounds,
  warningLead: WarningLeadSec,
  workSecRaw: unknown,
  restSecRaw: unknown
): EmomClean {
  const workSec = makeEmomIntervalSec(workSecRaw);

  if (warningLead >= workSec) {
    throw new HTTPException(400, { message: 'warning_lead_sec must be shorter than the interval' });
  }

  if (restSecRaw !== 0 && restSecRaw != null) {
    throw new HTTPException(400, { message: 'rest_sec must be 0 for EMOM workouts' });
  }

  return { name, type: 'emom', rounds, work_sec: workSec, rest_sec: 0, warning_lead_sec: warningLead };
}

function validateIntervals(
  name: WorkoutName,
  rounds: Rounds,
  warningLead: WarningLeadSec,
  workSecRaw: unknown,
  restSecRaw: unknown
): IntervalsClean {
  const workSec = makeWorkPhaseSec(workSecRaw);
  const restSec = makeRestPhaseSec(restSecRaw);

  if (warningLead >= workSec || warningLead >= restSec) {
    throw new HTTPException(400, { message: 'warning_lead_sec must be shorter than both work and rest' });
  }

  return { name, type: 'intervals', rounds, work_sec: workSec, rest_sec: restSec, warning_lead_sec: warningLead };
}
