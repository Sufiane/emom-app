import type { Brand } from '../brand';

export type PasswordHash = Brand<string, 'PasswordHash'>;

export function makePasswordHash(value: string): PasswordHash {
  return value as PasswordHash;
}
