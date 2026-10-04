import { HTTPException } from 'hono/http-exception';
import { badRequest } from '../../lib/bad-request';
import { randomId } from '../../lib/crypto';
import { makeBurstMaxSec, makeBurstMinSec, type BurstSec } from '../../lib/brand/burst-sec';
import { makeEmomIntervalSec, type EmomIntervalSec } from '../../lib/brand/emom-interval-sec';
import { makeMinRestSec, type MinRestSec } from '../../lib/brand/min-rest-sec';
import { makeRestPhaseSec, type RestPhaseSec } from '../../lib/brand/rest-phase-sec';
import { makeRounds, type Rounds } from '../../lib/brand/rounds';
import { makeTotalSec, type TotalSec } from '../../lib/brand/total-sec';
import { nowMs } from '../../lib/brand/unix-ms';
import type { UserId } from '../../lib/brand/user-id';
import { makeWarningLeadSec, type WarningLeadSec } from '../../lib/brand/warning-lead-sec';
import { makeWorkPhaseSec, type WorkPhaseSec } from '../../lib/brand/work-phase-sec';
import { makeWorkoutId, type WorkoutId } from '../../lib/brand/workout-id';
import { makeWorkoutName, type WorkoutName } from '../../lib/brand/workout-name';
import { WorkoutsDb, type WorkoutRow } from './workouts.db';

type EmomInput = {
  name: unknown;
  type: 'emom';
  rounds: unknown;
  work_sec: unknown;
  rest_sec?: unknown;
  warning_lead_sec: unknown;
};

type IntervalsInput = {
  name: unknown;
  type: 'intervals';
  rounds: unknown;
  work_sec: unknown;
  rest_sec: unknown;
  warning_lead_sec: unknown;
};

type RandomInput = {
  name: unknown;
  type: 'random';
  total_sec: unknown;
  min_rest_sec: unknown;
  burst_min_sec: unknown;
  burst_max_sec: unknown;
};

export type WorkoutInput = EmomInput | IntervalsInput | RandomInput;

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

type RandomClean = {
  name: WorkoutName;
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

type CleanInput = EmomClean | IntervalsClean | RandomClean;

export class WorkoutsService {
  constructor(private readonly db: WorkoutsDb) {}

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
      console.warn(`workout ${id} not found for user ${userId}`);

      throw new HTTPException(404, { message: 'workout_not_found' });
    }

    return existing;
  }
}

function validateInput(input: WorkoutInput): CleanInput {
  const name = makeWorkoutName(input.name);

  switch (input.type) {
    case 'random':
      return validateRandom(name, input);
    case 'emom':
      return validateEmom(name, input);
    case 'intervals':
      return validateIntervals(name, input);
    default:
      console.warn(`rejected unknown workout type ${String((input as { type: unknown }).type)}`);

      throw badRequest('type_invalid');
  }
}

function validateRandom(name: WorkoutName, input: RandomInput): RandomClean {
  const totalSec = makeTotalSec(input.total_sec);
  const minRestSec = makeMinRestSec(input.min_rest_sec);
  const burstMinSec = makeBurstMinSec(input.burst_min_sec);
  const burstMaxSec = makeBurstMaxSec(input.burst_max_sec);

  if (burstMinSec > burstMaxSec) {
    console.warn(`burst_min_sec ${burstMinSec} exceeds burst_max_sec ${burstMaxSec}`);

    throw badRequest('burst_min_exceeds_max');
  }

  if (Math.floor((totalSec - minRestSec) / (burstMinSec + minRestSec)) < 1) {
    console.warn(
      `total_sec ${totalSec} too short for burst_min_sec ${burstMinSec} and min_rest_sec ${minRestSec}`
    );

    throw badRequest('total_sec_too_short');
  }

  return {
    name,
    type: 'random',
    rounds: null,
    work_sec: null,
    rest_sec: 0,
    warning_lead_sec: 0,
    total_sec: totalSec,
    min_rest_sec: minRestSec,
    burst_min_sec: burstMinSec,
    burst_max_sec: burstMaxSec
  };
}

function validateEmom(name: WorkoutName, input: EmomInput): EmomClean {
  const rounds = makeRounds(input.rounds);
  const warningLead = makeWarningLeadSec(input.warning_lead_sec);
  const workSec = makeEmomIntervalSec(input.work_sec);

  if (warningLead >= workSec) {
    console.warn(`warning_lead_sec ${warningLead} not shorter than interval ${workSec}`);

    throw badRequest('warning_lead_too_long');
  }

  if (input.rest_sec !== 0 && input.rest_sec != null) {
    console.warn(`rest_sec ${String(input.rest_sec)} given for emom workout`);

    throw badRequest('rest_sec_must_be_zero');
  }

  return { name, type: 'emom', rounds, work_sec: workSec, rest_sec: 0, warning_lead_sec: warningLead };
}

function validateIntervals(name: WorkoutName, input: IntervalsInput): IntervalsClean {
  const rounds = makeRounds(input.rounds);
  const warningLead = makeWarningLeadSec(input.warning_lead_sec);
  const workSec = makeWorkPhaseSec(input.work_sec);
  const restSec = makeRestPhaseSec(input.rest_sec);

  if (warningLead >= workSec || warningLead >= restSec) {
    console.warn(`warning_lead_sec ${warningLead} not shorter than work ${workSec} and rest ${restSec}`);

    throw badRequest('warning_lead_too_long');
  }

  return { name, type: 'intervals', rounds, work_sec: workSec, rest_sec: restSec, warning_lead_sec: warningLead };
}
