import { HTTPException } from 'hono/http-exception';
import { randomId } from '../../lib/crypto';
import { WorkoutsDb, type WorkoutRow } from './workouts.db';

export type WorkoutInput = {
  name: string;
  total_duration_sec: number;
  interval_sec: number;
  warning_lead_sec: number;
};

const ALLOWED_INTERVALS = [30, 60, 90, 120];
const MIN_WARNING_LEAD = 5;
const MAX_WARNING_LEAD = 15;

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
      name: clean.name,
      total_duration_sec: clean.total_duration_sec,
      interval_sec: clean.interval_sec,
      warning_lead_sec: clean.warning_lead_sec,
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
      name: clean.name,
      total_duration_sec: clean.total_duration_sec,
      interval_sec: clean.interval_sec,
      warning_lead_sec: clean.warning_lead_sec,
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

  const interval = input.interval_sec;

  if (!ALLOWED_INTERVALS.includes(interval)) {
    throw new HTTPException(400, { message: 'interval_sec must be one of 30, 60, 90, 120' });
  }

  const warningLead = input.warning_lead_sec;

  if (!Number.isInteger(warningLead) || warningLead < MIN_WARNING_LEAD || warningLead > MAX_WARNING_LEAD) {
    throw new HTTPException(400, { message: 'warning_lead_sec must be between 5 and 15' });
  }

  const total = input.total_duration_sec;

  if (!Number.isInteger(total) || total <= 0 || total % interval !== 0) {
    throw new HTTPException(400, { message: 'total_duration_sec must be a positive multiple of interval_sec' });
  }

  if (warningLead >= interval) {
    throw new HTTPException(400, { message: 'warning_lead_sec must be shorter than interval_sec' });
  }

  return { name, total_duration_sec: total, interval_sec: interval, warning_lead_sec: warningLead };
}
