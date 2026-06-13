import { HTTPException } from 'hono/http-exception';
import type { Brand } from '../brand';

export type WorkoutId = Brand<string, 'WorkoutId'>;

export function makeWorkoutId(value: unknown): WorkoutId {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HTTPException(400, { message: 'invalid workout id' });
  }

  return value as WorkoutId;
}
