import { badRequest } from '../bad-request';
import type { Brand } from '../brand';

export type Email = Brand<string, 'Email'>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function makeEmail(value: unknown): Email {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (!EMAIL_PATTERN.test(normalized)) {
    throw badRequest('email_invalid');
  }

  return normalized as Email;
}
