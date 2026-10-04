import { badRequest } from '../bad-request';
import type { Brand } from '../brand';

export type MinRestSec = Brand<number, 'MinRestSec'>;

const MIN_REST_MIN = 5;
const MIN_REST_MAX = 120;

export function makeMinRestSec(value: unknown): MinRestSec {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw badRequest('min_rest_sec_not_integer');
  }

  if (value < MIN_REST_MIN || value > MIN_REST_MAX) {
    throw badRequest('min_rest_sec_out_of_range');
  }

  return value as MinRestSec;
}
