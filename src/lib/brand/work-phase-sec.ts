import { badRequest } from '../bad-request';
import type { Brand } from '../brand';

export type WorkPhaseSec = Brand<number, 'WorkPhaseSec'>;

const PHASE_MIN = 5;
const PHASE_MAX = 600;

export function makeWorkPhaseSec(value: unknown): WorkPhaseSec {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw badRequest('work_sec_not_integer');
  }

  if (value < PHASE_MIN || value > PHASE_MAX) {
    throw badRequest('work_sec_out_of_range');
  }

  return value as WorkPhaseSec;
}
