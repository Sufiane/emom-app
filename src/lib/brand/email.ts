import { HTTPException } from 'hono/http-exception';
import type { Brand } from '../brand';

export type Email = Brand<string, 'Email'>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function makeEmail(value: unknown): Email {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (!EMAIL_PATTERN.test(normalized)) {
    throw new HTTPException(400, { message: 'invalid email' });
  }

  return normalized as Email;
}
