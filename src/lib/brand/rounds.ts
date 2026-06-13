import { HTTPException } from 'hono/http-exception';
import type { Brand } from '../brand';

export type Rounds = Brand<number, 'Rounds'>;

const ROUNDS_MIN = 1;
const ROUNDS_MAX = 120;

export function makeRounds(value: unknown): Rounds {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new HTTPException(400, { message: 'rounds must be an integer' });
  }

  if (value < ROUNDS_MIN || value > ROUNDS_MAX) {
    throw new HTTPException(400, { message: `rounds must be between ${ROUNDS_MIN} and ${ROUNDS_MAX}` });
  }

  return value as Rounds;
}
