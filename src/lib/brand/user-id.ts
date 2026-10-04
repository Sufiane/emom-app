import { badRequest } from '../bad-request';
import type { Brand } from '../brand';

export type UserId = Brand<string, 'UserId'>;

export function makeUserId(value: unknown): UserId {
  if (typeof value !== 'string' || value.length === 0) {
    throw badRequest('user_id_invalid');
  }

  return value as UserId;
}
