# FPV Trainer API (backend)

Laravel 12 / Sanctum API backend for FPV Trainer. It serves the Angular
frontend (`../src`) over a JSON REST API under `api/v1`, backed by the
shared catalog in `../shared/catalog`.

For the full picture (domain modules, request lifecycle, anti-cheat model,
deployment, etc.) see [`../docs`](../docs):

- [`../docs/architecture.md`](../docs/architecture.md) — domain layout & request flow
- [`../docs/api.md`](../docs/api.md) — full endpoint reference + payload schemas
- [`../docs/competitive-integrity.md`](../docs/competitive-integrity.md) — anti-cheat model & limitations
- [`../docs/challenge-operations.md`](../docs/challenge-operations.md) — challenge rotation runbook
- [`../docs/privacy-data-map.md`](../docs/privacy-data-map.md) — what personal data is stored, where
- [`../docs/deployment.md`](../docs/deployment.md) — running this in production

## Requirements

- PHP 8.2+ with the `sqlite3`/`pdo_sqlite` extensions (or MySQL/PostgreSQL — see below)
- Composer 2
- Node is **not** required for the backend itself (Vite assets are unused by the API)

## Quick start

```bash
cd backend
composer install
cp .env.example .env        # already done if you're reading a checked-out repo
php artisan key:generate
touch database/database.sqlite
php artisan migrate:fresh --seed
php artisan serve            # http://localhost:8000
```

This seeds:

- The catalog mirror tables (`environments`, `courses`, `weather_presets`) from `../shared/catalog/*.json`.
- An admin account: `admin@fpv-trainer.test` / `password` (`is_admin = true`).
- Today's daily challenge and this week's weekly challenge.

Run the queue worker if you flip `QUEUE_CONNECTION` away from `sync` (see
[Async processing](#async-processing) below):

```bash
php artisan queue:work
```

Run the scheduler (challenge rotation, cleanup jobs) via cron or, for local
dev, `php artisan schedule:work`.

## Configuration

All FPV-specific configuration lives in [`config/fpv.php`](config/fpv.php)
and is driven by `FPV_*` env vars — see `.env.example` for the full list
(catalog path, version pins, race session TTL, anti-cheat thresholds, rate
limits, CORS). Key ones:

| Env var | Purpose |
|---|---|
| `FRONTEND_URL` | Angular origin, used for CORS + share links |
| `FPV_CATALOG_PATH` | Absolute path to `shared/catalog` (defaults to `../shared/catalog`) |
| `FPV_SUPPORTED_PHYSICS_VERSIONS` | Comma-separated list of client physics versions accepted by submissions |
| `FPV_RATE_LIMIT_AUTH` / `FPV_RATE_LIMIT_SUBMISSIONS` / `FPV_RATE_LIMIT_API` | Per-minute rate limits |

## Database

SQLite is the default and is sufficient for local dev, CI, and small
deployments (a single `database/database.sqlite` file). To use
PostgreSQL/MySQL instead, just update `DB_CONNECTION`/`DB_*` in `.env` —
nothing in the schema is SQLite-specific.

## Auth model

Token-based auth via Sanctum personal access tokens (`Authorization: Bearer
<token>`), **not** the SPA cookie flow — the frontend and API run on
different origins/ports in dev (`:4200` vs `:8000`) and in most deployment
topologies, so stateless bearer tokens avoid CSRF/cookie-domain complexity.
`config/cors.php` still allows the frontend origin for completeness, but
`supports_credentials` is `false`.

## Async processing

Verification, leaderboard updates, exports, and cleanup all go through
`app/Jobs/*`. `QUEUE_CONNECTION=sync` (the default here) runs them inline
during the request — fine for local dev/small deployments. Set it to
`database` (or `redis` if you already run Redis for something else — it is
**not** a hard requirement of this app) and run `php artisan queue:work`
for real async processing.

## Testing

```bash
php artisan test
```

Tests run against an in-memory SQLite database (`phpunit.xml`) with
`RefreshDatabase`, so they never touch your dev `database.sqlite`.

## Useful commands

```bash
php artisan route:list --path=api      # full API surface
php artisan schedule:list              # scheduled challenge/cleanup jobs
php artisan fpv:challenges:generate-daily
php artisan fpv:challenges:generate-weekly
php artisan fpv:challenges:close-expired
php artisan fpv:race-sessions:cleanup
php artisan fpv:replays:cleanup
```

## Project layout

```
app/
  Domain/            Business logic, grouped by bounded context (see architecture.md)
    Identity/         registration, login, username rules
    Pilots/           profiles, export, account deletion
    Courses/          catalog service + course/environment/weather models
    Races/            sessions, runs, splits, submission service
    AntiCheat/         RunVerificationService (heuristic anti-cheat)
    Leaderboards/      leaderboard entries + queries
    Challenges/        daily/weekly rotation, submissions, leaderboard
    Progression/       player/training progress merge
    Achievements/      unlocks
    Replays/           replay storage (DB or disk, size-capped)
    Sharing/           public result/replay share pages
    Moderation/        admin actions + audit log
  Http/
    Controllers/Api/V1/  thin controllers, one per resource
    Requests/Api/V1/     form request validation
    Middleware/
  Jobs/               queued verification/leaderboard/export/cleanup work
  Support/            ApiError / ApiException (shared error envelope)
  Console/Commands/   challenge rotation + cleanup artisan commands
database/
  migrations/
  seeders/
tests/
  Feature/            HTTP-level tests per domain
  Unit/                RunVerificationService unit tests
```
