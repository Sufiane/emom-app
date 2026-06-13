import type { UserId } from './lib/brand/user-id';

export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  JWT_SECRET: string;
};

export type Variables = {
  userId: UserId;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
