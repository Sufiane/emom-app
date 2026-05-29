import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './types';
import { authRoutes } from './modules/auth/auth.routes';
import { workoutsRoutes } from './modules/workouts/workouts.routes';

const app = new Hono<AppEnv>();

app.route('/api/auth', authRoutes);
app.route('/api/workouts', workoutsRoutes);

app.onError((error, context) => {
  if (error instanceof HTTPException) {
    return context.json({ error: error.message }, error.status);
  }

  console.error(error);

  return context.json({ error: 'internal error' }, 500);
});

export default app;
