import { badRequest } from '../bad-request';
import type { Brand } from '../brand';

export type WorkoutName = Brand<string, 'WorkoutName'>;

const WORKOUT_NAME_MAX = 80;

export function makeWorkoutName(value: unknown): WorkoutName {
  const trimmed = typeof value === 'string' ? value.trim() : '';

  if (trimmed.length === 0) {
    throw badRequest('name_required');
  }

  if (trimmed.length > WORKOUT_NAME_MAX) {
    throw badRequest('name_too_long');
  }

  return trimmed as WorkoutName;
}
