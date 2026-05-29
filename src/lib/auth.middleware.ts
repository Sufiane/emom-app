import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';
import type { AppEnv } from '../types';

export const AUTH_COOKIE = 'token';

export const requireAuth: MiddlewareHandler<AppEnv> = async (context, next) => {
  const token = getCookie(context, AUTH_COOKIE);

  if (token == null) {
    return context.json({ error: 'unauthorized' }, 401);
  }

  try {
    const payload = await verify(token, context.env.JWT_SECRET, 'HS256');
    const sub = payload.sub;

    if (typeof sub !== 'string') {
      return context.json({ error: 'unauthorized' }, 401);
    }

    context.set('userId', sub);
  } catch {
    return context.json({ error: 'unauthorized' }, 401);
  }

  return next();
};
