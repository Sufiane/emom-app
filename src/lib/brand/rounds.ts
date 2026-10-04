import { badRequest } from '../bad-request';
import type { Brand } from '../brand';

export type Rounds = Brand<number, 'Rounds'>;

const ROUNDS_MIN = 1;
const ROUNDS_MAX = 120;

export function makeRounds(value: unknown): Rounds {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw badRequest('rounds_not_integer');
  }

  if (value < ROUNDS_MIN || value > ROUNDS_MAX) {
    throw badRequest('rounds_out_of_range');
  }

  return value as Rounds;
}
