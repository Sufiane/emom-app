import { HTTPException } from 'hono/http-exception';
import { randomId } from '../../lib/crypto';
import { WorkoutsDb, type WorkoutRow, type WorkoutType } from './workouts.db';

export type WorkoutInput = {
  name: string;
  type: WorkoutType;
  rounds: number;
  work_sec: number;
  rest_sec: number;
  warning_lead_sec: number;
};

const EMOM_INTERVALS = [30, 60, 90, 120];
const MIN_WARNING_LEAD = 3;
const MAX_WARNING_LEAD = 15;
const MAX_ROUNDS = 120;
const MAX_PHASE_SEC = 600;

export class WorkoutsService {
  constructor(private db: WorkoutsDb) {}

  list(userId: string): Promise<WorkoutRow[]> {
    return this.db.listByUser(userId);
  }

  async create(userId: string, input: WorkoutInput): Promise<WorkoutRow> {
    const clean = validateInput(input);
    const now = Date.now();
    const row: WorkoutRow = {
      id: randomId(),
      user_id: userId,
      ...clean,
      created_at: now,
      updated_at: now
    };

    await this.db.insert(row);

    return row;
  }

  async update(userId: string, id: string, input: WorkoutInput): Promise<WorkoutRow> {
    const existing = await this.owned(userId, id);
    const clean = validateInput(input);
    const row: WorkoutRow = {
      ...existing,
      ...clean,
      updated_at: Date.now()
    };

    await this.db.update(row);

    return row;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.db.deleteById(id);
  }

  private async owned(userId: string, id: string): Promise<WorkoutRow> {
    const existing = await this.db.findById(id);

    if (existing == null || existing.user_id !== userId) {
      throw new HTTPException(404, { message: 'workout not found' });
    }

    return existing;
  }
}

function validateInput(input: WorkoutInput): WorkoutInput {
  const name = typeof input.name === 'string' ? input.name.trim() : '';

  if (name.length === 0) {
    throw new HTTPException(400, { message: 'name is required' });
  }

  if (input.type !== 'emom' && input.type !== 'intervals') {
    throw new HTTPException(400, { message: 'type must be "emom" or "intervals"' });
  }

  const rounds = input.rounds;

  if (!Number.isInteger(rounds) || rounds < 1 || rounds > MAX_ROUNDS) {
    throw new HTTPException(400, { message: `rounds must be between 1 and ${MAX_ROUNDS}` });
  }

  const warningLead = input.warning_lead_sec;

  if (!Number.isInteger(warningLead) || warningLead < MIN_WARNING_LEAD || warningLead > MAX_WARNING_LEAD) {
    throw new HTTPException(400, { message: `warning_lead_sec must be between ${MIN_WARNING_LEAD} and ${MAX_WARNING_LEAD}` });
  }

  if (input.type === 'emom') {
    return validateEmom(name, rounds, warningLead, input.work_sec, input.rest_sec);
  }

  return validateIntervals(name, rounds, warningLead, input.work_sec, input.rest_sec);
}

function validateEmom(
  name: string,
  rounds: number,
  warningLead: number,
  workSec: number,
  restSec: number
): WorkoutInput {
  if (!EMOM_INTERVALS.includes(workSec)) {
    throw new HTTPException(400, { message: 'interval (work_sec) must be one of 30, 60, 90, 120' });
  }

  if (warningLead >= workSec) {
    throw new HTTPException(400, { message: 'warning_lead_sec must be shorter than the interval' });
  }

  if (restSec !== 0 && restSec != null) {
    throw new HTTPException(400, { message: 'rest_sec must be 0 for EMOM workouts' });
  }

  return { name, type: 'emom', rounds, work_sec: workSec, rest_sec: 0, warning_lead_sec: warningLead };
}

function validateIntervals(
  name: string,
  rounds: number,
  warningLead: number,
  workSec: number,
  restSec: number
): WorkoutInput {
  if (!Number.isInteger(workSec) || workSec < 5 || workSec > MAX_PHASE_SEC) {
    throw new HTTPException(400, { message: `work_sec must be between 5 and ${MAX_PHASE_SEC}` });
  }

  if (!Number.isInteger(restSec) || restSec < 1 || restSec > MAX_PHASE_SEC) {
    throw new HTTPException(400, { message: `rest_sec must be between 1 and ${MAX_PHASE_SEC}` });
  }

  if (warningLead >= workSec || warningLead >= restSec) {
    throw new HTTPException(400, { message: 'warning_lead_sec must be shorter than both work and rest' });
  }

  return { name, type: 'intervals', rounds, work_sec: workSec, rest_sec: restSec, warning_lead_sec: warningLead };
}
