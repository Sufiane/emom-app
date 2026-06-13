import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireAuth } from '../../lib/auth.middleware';
import { makeWorkoutId } from '../../lib/brand/workout-id';
import { WorkoutsDb } from './workouts.db';
import { WorkoutsService, type WorkoutInput } from './workouts.service';

function buildService(db: D1Database): WorkoutsService {
  return new WorkoutsService(new WorkoutsDb(db));
}

export const workoutsRoutes = new Hono<AppEnv>();

workoutsRoutes.use('*', requireAuth);

workoutsRoutes.get('/', async (context) => {
  const service = buildService(context.env.DB);
  const workouts = await service.list(context.get('userId'));

  return context.json({ workouts });
});

workoutsRoutes.post('/', async (context) => {
  const body = await context.req.json<WorkoutInput>();
  const service = buildService(context.env.DB);
  const workout = await service.create(context.get('userId'), body);

  return context.json({ workout }, 201);
});

workoutsRoutes.put('/:id', async (context) => {
  const body = await context.req.json<WorkoutInput>();
  const service = buildService(context.env.DB);
  const workout = await service.update(context.get('userId'), makeWorkoutId(context.req.param('id')), body);

  return context.json({ workout });
});

workoutsRoutes.delete('/:id', async (context) => {
  const service = buildService(context.env.DB);

  await service.remove(context.get('userId'), makeWorkoutId(context.req.param('id')));

  return context.json({ ok: true });
});
