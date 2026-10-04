import { badRequest } from '../bad-request';
import type { Brand } from '../brand';

export type BurstSec = Brand<number, 'BurstSec'>;

const BURST_MIN = 5;
const BURST_MAX = 120;

function parseBurstSec(value: unknown, field: 'burst_min_sec' | 'burst_max_sec'): BurstSec {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw badRequest(`${field}_not_integer`);
  }

  if (value < BURST_MIN || value > BURST_MAX) {
    throw badRequest(`${field}_out_of_range`);
  }

  return value as BurstSec;
}

export function makeBurstMinSec(value: unknown): BurstSec {
  return parseBurstSec(value, 'burst_min_sec');
}

export function makeBurstMaxSec(value: unknown): BurstSec {
  return parseBurstSec(value, 'burst_max_sec');
}
