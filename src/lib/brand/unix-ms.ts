import type { Brand } from '../brand';

export type UnixMs = Brand<number, 'UnixMs'>;

export function makeUnixMs(value: number): UnixMs {
  return value as UnixMs;
}

export function nowMs(): UnixMs {
  return Date.now() as UnixMs;
}
