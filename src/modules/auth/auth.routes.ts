import { Hono, type Context } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { sign } from 'hono/jwt';
import type { AppEnv } from '../../types';
import { AUTH_COOKIE, requireAuth } from '../../lib/auth.middleware';
import { AuthDb } from './auth.db';
import { AuthService, type PublicUser } from './auth.service';

const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;

function buildService(db: D1Database): AuthService {
  return new AuthService(new AuthDb(db));
}

async function issueSession(context: Context<AppEnv>, secret: string, user: PublicUser): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC;
  const token = await sign({ sub: user.id, exp }, secret);

  setCookie(context, AUTH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC
  });
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/register', async (context) => {
  const body = await context.req.json<{ email?: string; password?: string }>();
  const service = buildService(context.env.DB);
  const user = await service.register(body.email ?? '', body.password ?? '');

  await issueSession(context, context.env.JWT_SECRET, user);

  return context.json({ user }, 201);
});

authRoutes.post('/login', async (context) => {
  const body = await context.req.json<{ email?: string; password?: string }>();
  const service = buildService(context.env.DB);
  const user = await service.login(body.email ?? '', body.password ?? '');

  await issueSession(context, context.env.JWT_SECRET, user);

  return context.json({ user });
});

authRoutes.post('/logout', (context) => {
  deleteCookie(context, AUTH_COOKIE, { path: '/' });

  return context.json({ ok: true });
});

authRoutes.get('/me', requireAuth, async (context) => {
  const service = buildService(context.env.DB);
  const user = await service.getById(context.get('userId'));

  return context.json({ user });
});
