import { badRequest } from '../bad-request';
import type { Brand } from '../brand';

export type PyramidRestSec = Brand<number, 'PyramidRestSec'>;

const REST_MIN = 1;

export function makePyramidRestSec(value: unknown): PyramidRestSec {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < REST_MIN) {
    throw badRequest('rest_out_of_range');
  }

  return value as PyramidRestSec;
}
