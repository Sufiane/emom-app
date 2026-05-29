# EMOM Timer

A free EMOM ("Every Minute On the Minute") and interval workout timer, built as an
installable, offline-capable PWA. Pick an interval and number of rounds and the timer
runs the session for you: a "ring ring" warning before each round ends, a clock tic-toc
countdown, and a boxing-style bell on every round.

**Live:** https://emom-app.su-souissi.workers.dev

## Features

- Configurable interval (30 / 60 / 90 / 120 s) and number of rounds
- Adjustable warning lead (5–15 s) with a ring alert, tic-toc countdown, and round bell
- All sounds are synthesized with the Web Audio API and scheduled on the audio clock
  (no audio files, no timing drift)
- Run instantly as a **guest**, or create an account to **save and reuse** workouts
- Works fully offline after first load; installable to the home screen

## Tech stack

- **Frontend:** vanilla HTML / CSS / JS (no framework), Web Audio API, service worker
- **Backend:** [Hono](https://hono.dev) on **Cloudflare Workers** (free tier)
- **Storage:** Cloudflare **D1** (SQLite)
- **Auth:** email + password, PBKDF2 hashing via Web Crypto, stateless JWT in an httpOnly cookie

A single Worker serves both the static PWA (via Workers Static Assets) and the `/api/*` routes.

## Architecture

The backend uses a hexagonal split — each module is three files:

| File | Responsibility |
|---|---|
| `*.routes.ts` | HTTP layer (controller) |
| `*.service.ts` | Business logic, validation, hashing — no DB access |
| `*.db.ts` | The only file that touches D1 |

```
src/
  index.ts                 # Hono app: mounts /api routes, error handling
  types.ts                 # Bindings + context variable types
  lib/
    crypto.ts              # PBKDF2 hash/verify (PHC string), random id
    auth.middleware.ts     # JWT cookie verification
  db/schema.sql            # D1 tables
  modules/
    auth/                  # register / login / logout / me
    workouts/              # workout CRUD, scoped + ownership-checked per user
public/
  index.html, styles.css   # app shell + crawlable landing/FAQ content
  js/
    app.js                 # view routing, auth + workouts UI, guest mode
    api.js                 # fetch wrappers
    timer.js               # EMOM engine + Web Audio sound synthesis
  manifest.webmanifest, sw.js, icons/, robots.txt, sitemap.xml
```

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register` | sets auth cookie |
| POST | `/api/auth/login` | sets auth cookie |
| POST | `/api/auth/logout` | clears cookie |
| GET | `/api/auth/me` | current user (auth) |
| GET | `/api/workouts` | list current user's workouts (auth) |
| POST | `/api/workouts` | create (auth) |
| PUT | `/api/workouts/:id` | update, ownership-checked (auth) |
| DELETE | `/api/workouts/:id` | delete, ownership-checked (auth) |

Validation: `interval_sec ∈ {30,60,90,120}`, `warning_lead_sec` 5–15, `total_duration_sec`
a positive multiple of `interval_sec`.

## Local development

Requires Node 24+ and a Cloudflare account (for `wrangler`).

```bash
npm install
npm run db:local        # apply schema to the local D1
echo "JWT_SECRET=local-dev-secret" > .dev.vars
npm run dev             # wrangler dev on http://localhost:8787
```

Other scripts: `npm run typecheck`, `npm run lint`.

## Deployment

```bash
wrangler login
wrangler d1 create emom-app        # put the returned id into wrangler.jsonc
npm run db:remote                  # apply schema to the remote D1
wrangler secret put JWT_SECRET     # set a real secret
npm run deploy
```

## Conventions

- Exact-pinned dependencies (no `^`/`~`)
- Explicit return types on backend functions; ESLint enforces style (`npm run lint`)

## License

Private project.
