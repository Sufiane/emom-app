import { badRequest } from '../bad-request';
import type { Brand } from '../brand';

export type TotalSec = Brand<number, 'TotalSec'>;

const TOTAL_MIN = 60;
const TOTAL_MAX = 3_600;

export function makeTotalSec(value: unknown): TotalSec {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw badRequest('total_sec_not_integer');
  }

  if (value < TOTAL_MIN || value > TOTAL_MAX) {
    throw badRequest('total_sec_out_of_range');
  }

  return value as TotalSec;
}
