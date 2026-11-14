import { badRequest } from '../bad-request';
import type { Brand } from '../brand';

export type PyramidMode = Brand<'normal' | 'hard', 'PyramidMode'>;

export function makePyramidMode(value: unknown): PyramidMode {
  if (value !== 'normal' && value !== 'hard') {
    throw badRequest('mode_invalid');
  }

  return value as PyramidMode;
}
