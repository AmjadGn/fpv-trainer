# Challenge Operations Runbook

How daily/weekly challenge rotation works, how to operate it, and how to
add new challenges to the pool.

## How rotation works

`App\Domain\Challenges\Services\ChallengeRotationService` picks a
challenge deterministically for a given period:

1. **Pools**: `shared/catalog/challenge-rotation.json` has a `dailyPool`
   and `weeklyPool`, each a list of challenge definitions
   (`slug`, `title`, `description`, `environmentId`, `courseId`,
   `weatherPresetId`, `scoringType`, `xpReward`, `medalThresholdsMs`).
2. **Period key**: daily periods are `YYYY-MM-DD` (server "today", calendar
   day boundary); weekly periods are ISO week strings `GGGG-Www` (Monday
   start, via `Carbon::startOfWeek(Carbon::MONDAY)`).
3. **Deterministic pick**: `seed = sha256("{pool}:{period}")`; the pool
   index is `intval(substr(seed, 0, 8), 16) % count(pool)`. Same pool +
   same period always picks the same definition, on any server, with no
   coordination needed between processes.
4. **Idempotent generation**: `challenge_instances` has a unique
   `(pool, period)` index. `generate()` checks for an existing row before
   *and* inside a DB transaction (belt-and-suspenders against a race
   between two cron workers firing at once) — calling
   `generateDaily()`/`generateWeekly()` any number of times for the same
   period is a no-op after the first call.
5. **`ChallengeDefinition`** rows are `updateOrCreate`d by `slug`, so
   editing a definition's title/xpReward/etc. in the JSON and re-running
   generation updates the definition even for an already-created instance
   (the *pick* for a past period never changes, only the definition's
   metadata can be refreshed).

## Scheduled jobs

Wired in `bootstrap/app.php` via `->withSchedule(...)`:

| Command | Schedule | Purpose |
|---|---|---|
| `fpv:challenges:generate-daily` | `dailyAt('00:01')` | Ensure today's daily instance exists |
| `fpv:challenges:generate-weekly` | `weeklyOn(1, '00:05')` (Monday) | Ensure this week's weekly instance exists |
| `fpv:challenges:close-expired` | `hourly()` | Flip `active` instances past `ends_at` to `closed` |

Run `php artisan schedule:list` to confirm, and `php artisan schedule:work`
locally (or a real cron entry hitting `schedule:run` every minute in
production) to actually execute them.

**You don't strictly need the scheduler for correctness** —
`GET /challenges/active` calls `ChallengeRotationService::ensureActive()`
on every request, which self-heals by generating the current day's/week's
instance if it's missing. The scheduled commands exist so instances are
warm before the first request of the day and so `closeExpired()` actually
runs (nothing else calls it).

## Manual operations

```bash
# Force-generate for right now (idempotent - safe to re-run)
php artisan fpv:challenges:generate-daily
php artisan fpv:challenges:generate-weekly

# Close anything past its end time
php artisan fpv:challenges:close-expired

# Inspect current + historical instances
php artisan tinker
>>> App\Domain\Challenges\Models\ChallengeInstance::latest()->limit(10)->get();
```

Or via the admin API: `GET /admin/challenges?perPage=` (requires an admin
token).

## Adding a new challenge to the pool

1. Add an entry to `shared/catalog/challenge-rotation.json`'s `dailyPool`
   or `weeklyPool`:

   ```json
   {
     "slug": "coastal-crosswind-sprint",
     "title": "Coastal Crosswind Sprint",
     "description": "Race the coastal run in gusty crosswind conditions.",
     "environmentId": "coastal-cliffs",
     "courseId": "coastal-run",
     "weatherPresetId": "crosswind-gusty",
     "scoringType": "fastest_time",
     "xpReward": 150,
     "medalThresholdsMs": { "gold": 60000, "silver": 75000, "bronze": 90000 }
   }
   ```

2. Make sure `courseId`/`environmentId`/`weatherPresetId` all exist and are
   `enabled` in `courses.json`/`environments.json`/`weather-presets.json`,
   and that the weather preset is valid for that environment (see
   `CatalogService::isWeatherPresetForEnvironment`) — `RunVerificationService`
   will hard-reject submissions against an invalid combination.
3. No migration or deploy step beyond restarting app/queue workers to drop
   the 5-minute catalog cache (`CatalogService` caches file reads for 300s;
   see below) — the pool is picked up automatically on the next
   generation for a period that hasn't been created yet.
4. **Existing generated instances are not retroactively changed** — adding
   a slug only affects *future* period picks (it enters the deterministic
   index rotation the next time that pool/period combination is
   generated). To immediately test a specific slug, temporarily narrow the
   pool to just that entry, or use `ChallengeSeeder`/tinker to force a
   pick for a period whose seed happens to select it.

## Cache invalidation

`CatalogService` caches each JSON file's decoded contents for 5 minutes
(`Cache::remember`, 300s TTL) plus an in-memory per-request memo. After
editing `challenge-rotation.json` (or any catalog file) in production,
either wait 5 minutes or clear the cache explicitly:

```bash
php artisan cache:forget fpv.catalog.challenge-rotation
# or, to be safe, clear everything:
php artisan cache:clear
```

## Seeding

`database/seeders/ChallengeSeeder.php` calls
`ChallengeRotationService::ensureActive()` so `php artisan migrate:fresh
--seed` always leaves you with a live daily + weekly challenge to test
against, without needing the scheduler running.
