import { HTTPException } from 'hono/http-exception';
import type { Brand } from '../brand';

export type UserId = Brand<string, 'UserId'>;

export function makeUserId(value: unknown): UserId {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HTTPException(400, { message: 'invalid user id' });
  }

  return value as UserId;
}
