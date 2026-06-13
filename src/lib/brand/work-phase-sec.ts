import { HTTPException } from 'hono/http-exception';
import type { Brand } from '../brand';

export type WorkPhaseSec = Brand<number, 'WorkPhaseSec'>;

const PHASE_MIN = 5;
const PHASE_MAX = 600;

export function makeWorkPhaseSec(value: unknown): WorkPhaseSec {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new HTTPException(400, { message: 'work_sec must be an integer' });
  }

  if (value < PHASE_MIN || value > PHASE_MAX) {
    throw new HTTPException(400, { message: `work_sec must be between ${PHASE_MIN} and ${PHASE_MAX}` });
  }

  return value as WorkPhaseSec;
}
