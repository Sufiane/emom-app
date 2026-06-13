import { HTTPException } from 'hono/http-exception';
import type { Brand } from '../brand';

export type EmomIntervalSec = Brand<30 | 60 | 90 | 120, 'EmomIntervalSec'>;

const EMOM_INTERVALS: readonly number[] = [30, 60, 90, 120];

export function makeEmomIntervalSec(value: unknown): EmomIntervalSec {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new HTTPException(400, { message: 'work_sec must be an integer' });
  }

  if (!EMOM_INTERVALS.includes(value)) {
    throw new HTTPException(400, { message: 'interval (work_sec) must be one of 30, 60, 90, 120' });
  }

  return value as EmomIntervalSec;
}
