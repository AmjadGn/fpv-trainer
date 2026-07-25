# Deployment

## Topology

Two independently deployable apps sharing one JSON catalog:

```
Angular app (src/)  --HTTPS/JSON, Bearer token-->  Laravel API (backend/)
                                                          |
                                                    shared/catalog/*.json
                                                    (read at runtime, no DB dependency)
```

They can live on the same host or completely separate infrastructure —
the only coupling is (a) the API needing filesystem access to
`shared/catalog/` (or a copy of it — see below) and (b) CORS/env config
pointing each app at the other's URL.

## Database

**PostgreSQL is the recommended production database.** SQLite (the dev
default) is fine for small/low-concurrency deployments but a single file
doesn't handle concurrent writers as gracefully as a real RDBMS — this app
has no PostgreSQL/MySQL-specific SQL, so switching is just env config:

```bash
DB_CONNECTION=pgsql
DB_HOST=your-db-host
DB_PORT=5432
DB_DATABASE=fpv_trainer
DB_USERNAME=fpv_trainer
DB_PASSWORD=...
```

Then `php artisan migrate --force` (omit `--seed` in production unless you
specifically want the demo admin account — see [Admin account](#admin-account) below).

## Required environment configuration

Copy `backend/.env.example` → `backend/.env` and set at minimum:

| Var | Production guidance |
|---|---|
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` — never leak stack traces/exception messages in `error.message` |
| `APP_KEY` | `php artisan key:generate` — generate once, keep stable (rotating invalidates all sessions/encrypted data) |
| `APP_URL` | Your API's public URL |
| `DB_*` | Point at your PostgreSQL/MySQL instance (see above) |
| `FRONTEND_URL` | The Angular app's public origin, e.g. `https://app.fpv-trainer.example` |
| `FPV_CORS_ALLOWED_ORIGINS` | Same as `FRONTEND_URL` (comma-separated if you have multiple frontend origins) |
| `FPV_CATALOG_PATH` | Absolute path to a `shared/catalog` directory reachable from the API process (see [Catalog deployment](#catalog-deployment)) |
| `MAIL_MAILER` + `MAIL_*` | A real transactional provider (SES, Postmark, etc.) — `log` only works for local dev |
| `QUEUE_CONNECTION` | `database` (or `redis` if you already run it) once traffic justifies async processing — see [Queues](#queues) |
| `SESSION_DRIVER` / `CACHE_STORE` | `database` works fine at small scale; move to `redis` if you need shared cache across multiple app instances |

Leave `FPV_SUPPORTED_PHYSICS_VERSIONS`, `FPV_CATALOG_VERSION`, etc. aligned
with whatever the deployed Angular client build actually ships — these
gate what the API will accept from submissions (see `docs/architecture.md`).

## Catalog deployment

The API reads `shared/catalog/*.json` directly off disk at runtime
(`CatalogService`, 5-minute cache). In production you have two options:

1. **Deploy the monorepo as-is** and keep `FPV_CATALOG_PATH` unset (it
   defaults to `base_path('../shared/catalog')`, i.e. a sibling directory
   of `backend/`) — simplest if both apps are built from the same
   checkout/artifact.
2. **Deploy `backend/` standalone** (e.g. separate container image) and
   copy `shared/catalog/` into the image, setting `FPV_CATALOG_PATH` to
   wherever you placed it. Nothing else in the backend depends on the rest
   of the monorepo.

Either way, updating catalog content is a **content deploy, not a schema
migration** — see [`challenge-operations.md`](challenge-operations.md#cache-invalidation)
for cache invalidation after editing it in place.

## Queues

`QUEUE_CONNECTION=sync` (the default) runs `VerifyRaceRunJob`,
`UpdateLeaderboardJob`, `ExportProfileDataJob`, and the cleanup jobs inline
during the request/command that dispatches them. This is fine at low
traffic and keeps the deployment simple (no worker process to run/monitor).

Once submission volume grows enough that inline verification adds
noticeable latency to `POST /race-submissions`, switch to a real queue:

```bash
QUEUE_CONNECTION=database   # or redis
php artisan queue:table && php artisan migrate   # if using the database driver and it isn't migrated yet
```

Run a worker (supervisor/systemd unit, or your platform's process manager):

```bash
php artisan queue:work --tries=3
```

Redis is **not required** — it's supported as a queue/cache backend if you
already run it for other services, but the `database` driver is a
perfectly reasonable choice for this app's scale.

## Scheduler

Register one cron entry (works the same whether queues are sync or async):

```
* * * * * cd /path/to/backend && php artisan schedule:run >> /dev/null 2>&1
```

This drives challenge rotation and cleanup — see
[`challenge-operations.md`](challenge-operations.md#scheduled-jobs) for
exactly what runs and when. `GET /challenges/active` self-heals challenge
generation even if the scheduler is briefly down, but the cleanup jobs
(`fpv:race-sessions:cleanup`, `fpv:replays:cleanup`) only run from the
scheduler — without cron, expired sessions and abandoned replays
accumulate indefinitely.

## Storage

`php artisan storage:link` is not required (replays/exports use the
`local` disk directly, not `public`). Ensure `storage/app/replays/` and
`storage/app/exports/` are writable by the app process and, if you run
multiple app instances behind a load balancer, backed by shared/networked
storage (e.g. an NFS mount or S3-backed filesystem driver) rather than
per-instance local disk — otherwise a replay written by instance A won't
be readable by instance B.

## CORS & auth

The frontend and API are expected to run on **different origins**
(`FRONTEND_URL` vs `APP_URL`). Auth is stateless Bearer-token Sanctum
(`Authorization: Bearer <token>`), so:

- `config/cors.php` allows `FRONTEND_URL`/`FPV_CORS_ALLOWED_ORIGINS` on
  `api/*` with `supports_credentials = false` — no cookies are involved,
  so there's no CSRF token dance and no cookie `SameSite`/domain
  configuration to get right.
- `SANCTUM_STATEFUL_DOMAINS` is present in `.env.example` for completeness
  but **unused by the token flow** — it only matters if you later adopt
  Sanctum's first-party-cookie SPA authentication instead.
- Always serve both apps over HTTPS in production; bearer tokens in a
  plaintext `Authorization` header are only as safe as the transport.

## Admin account

`AdminUserSeeder` creates `admin@fpv-trainer.test` / `password` with
`is_admin = true`. **Do not run this seeder against a production database
without changing the password immediately after**, or better: seed a
proper admin account out-of-band (tinker/manual SQL) and skip
`AdminUserSeeder` in production deploys (`DatabaseSeeder` calls it
unconditionally, so either guard it behind an env check or run
migrations/other seeders selectively in production, e.g. `php artisan
db:seed --class=CatalogSeeder`).

## Health checks

Laravel's built-in health route is enabled at `GET /up` (configured in
`bootstrap/app.php`) — point your load balancer/orchestrator health check
there. It confirms the app boots and can reach the database, not that
queues/scheduler are running.

## Pre-deploy checklist

```bash
composer install --no-dev --optimize-autoloader
php artisan config:cache
php artisan route:cache
php artisan event:cache
php artisan migrate --force
php artisan db:seed --class=CatalogSeeder --force   # keep catalog mirror tables current; skip AdminUserSeeder in prod
```

Remember to bust `config:cache`/`route:cache` on every subsequent deploy
that changes `.env` or routes (re-run the same commands).
