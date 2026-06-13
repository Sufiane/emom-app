import { HTTPException } from 'hono/http-exception';
import type { Brand } from '../brand';

export type WorkoutName = Brand<string, 'WorkoutName'>;

const WORKOUT_NAME_MAX = 80;

export function makeWorkoutName(value: unknown): WorkoutName {
  const trimmed = typeof value === 'string' ? value.trim() : '';

  if (trimmed.length === 0) {
    throw new HTTPException(400, { message: 'name is required' });
  }

  if (trimmed.length > WORKOUT_NAME_MAX) {
    throw new HTTPException(400, { message: `name must be at most ${WORKOUT_NAME_MAX} characters` });
  }

  return trimmed as WorkoutName;
}
