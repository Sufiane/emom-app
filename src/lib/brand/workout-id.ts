import { badRequest } from '../bad-request';
import type { Brand } from '../brand';

export type WorkoutId = Brand<string, 'WorkoutId'>;

export function makeWorkoutId(value: unknown): WorkoutId {
  if (typeof value !== 'string' || value.length === 0) {
    throw badRequest('workout_id_invalid');
  }

  return value as WorkoutId;
}
