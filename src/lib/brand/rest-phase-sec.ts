import { badRequest } from '../bad-request';
import type { Brand } from '../brand';

export type RestPhaseSec = Brand<number, 'RestPhaseSec'>;

const PHASE_MIN = 1;
const PHASE_MAX = 600;

export function makeRestPhaseSec(value: unknown): RestPhaseSec {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw badRequest('rest_sec_not_integer');
  }

  if (value < PHASE_MIN || value > PHASE_MAX) {
    throw badRequest('rest_sec_out_of_range');
  }

  return value as RestPhaseSec;
}
