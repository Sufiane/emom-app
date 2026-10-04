import { badRequest } from '../bad-request';
import type { Brand } from '../brand';

export type EmomIntervalSec = Brand<30 | 60 | 90 | 120, 'EmomIntervalSec'>;

const EMOM_INTERVALS: readonly number[] = [30, 60, 90, 120];

export function makeEmomIntervalSec(value: unknown): EmomIntervalSec {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw badRequest('work_sec_not_integer');
  }

  if (!EMOM_INTERVALS.includes(value)) {
    throw badRequest('work_sec_interval_not_allowed');
  }

  return value as EmomIntervalSec;
}
