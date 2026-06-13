import { HTTPException } from 'hono/http-exception';
import type { Brand } from '../brand';

export type RestPhaseSec = Brand<number, 'RestPhaseSec'>;

const PHASE_MIN = 1;
const PHASE_MAX = 600;

export function makeRestPhaseSec(value: unknown): RestPhaseSec {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new HTTPException(400, { message: 'rest_sec must be an integer' });
  }

  if (value < PHASE_MIN || value > PHASE_MAX) {
    throw new HTTPException(400, { message: `rest_sec must be between ${PHASE_MIN} and ${PHASE_MAX}` });
  }

  return value as RestPhaseSec;
}
