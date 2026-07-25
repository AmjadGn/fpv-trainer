# Architecture

FPV Trainer is a monorepo with two applications:

- `src/` — the Angular flight-sim/training frontend (Three.js rendering, training academy, HUD, etc).
- `backend/` — a Laravel 12 + Sanctum JSON API that adds accounts, competitive
  race submissions, leaderboards, daily/weekly challenges, and progress sync
  on top of what is otherwise a fully client-side experience.
- `shared/catalog/` — the single source of truth for courses, environments,
  weather presets, achievements, and the challenge rotation pool. Both the
  Angular app and the Laravel API read from these JSON files, so gameplay
  content never has to be duplicated or kept in sync by hand.

The backend is intentionally a *thin competitive layer*: training, physics,
and rendering all stay 100% client-side. The API's job is to (a) know who
you are, (b) accept and sanity-check race results, (c) rank them, and (d)
remember your progress across devices.

## Domain-driven layout

Business logic lives under `app/Domain/<Module>/`, grouped by bounded
context rather than by technical layer. Controllers under
`app/Http/Controllers/Api/V1/` stay thin — they validate input via Form
Requests, delegate to a domain Action/Service, and shape the response.

```
app/Domain/<Module>/
  Models/       Eloquent models for this module's tables
  Actions/      single-purpose write operations (RegisterUserAction, DeleteAccountAction, ...)
  Services/     multi-step business logic / orchestration (RaceSubmissionService, LeaderboardService, ...)
  Queries/      read-only lookups shaped for a specific API response
  Policies/     Laravel authorization policies
  ValueObjects/ small immutable DTOs (e.g. VerificationResult)
  Rules/        custom validation rules (e.g. Username)
```

| Module | Responsibility |
|---|---|
| **Identity** | Registration, login/logout, username validation, password reset |
| **Pilots** | Profile CRUD, public pilot pages, data export, account deletion/anonymization |
| **Courses** | `CatalogService` (reads `shared/catalog/*.json`), catalog mirror models |
| **Races** | Race sessions (nonce-bound), race runs, splits, submission handling |
| **AntiCheat** | `RunVerificationService` — heuristic validation of submitted runs |
| **Leaderboards** | Best-per-user leaderboard entries, pagination, "around me" |
| **Challenges** | Daily/weekly rotation, challenge sessions/submissions, challenge leaderboards |
| **Seasons** | Primary season lifecycle, divisions, participation, rating, missions, and completion rewards |
| **Tournaments** | Date-driven registration, limited ranked attempts, practice, and standings |
| **GhostEvents** | Timed benchmark bundles, ghost attempts, and event rankings |
| **Rewards/Cosmetics** | Idempotent entitlements, lifecycle grants, cosmetic definitions, and loadouts |
| **Notifications/Features/Beta** | Pilot preferences, controlled email, feature targeting, and invitation gates |
| **Progression** | Player/training progress merge (client ⇄ server reconciliation) |
| **Achievements** | Unlocked achievement records |
| **Replays** | Storage/retrieval of replay payloads (DB-JSON or disk, size-capped) |
| **Sharing** | Public result/replay pages, visibility control |
| **Moderation** | Admin actions (suspend/ban/reinstate, manual review), audit log |

Cross-cutting concerns live outside `Domain/`:

- `app/Support/ApiError.php` / `ApiException.php` — the single place that
  knows how to shape `{"error": {...}}` responses.
- `app/Http/Middleware/AssignRequestId.php` — stamps every request/response
  with an `X-Request-Id`, echoed back in `error.requestId` for support/debugging.
- `app/Http/Middleware/EnsureAdmin.php` — gate for `admin.*` routes.
- `app/Jobs/*` — async work (verification, leaderboard updates, exports, cleanup).
- `app/Console/Commands/*` — the artisan commands the scheduler drives.

## Request lifecycle: a race submission

This is the most involved flow in the system, and a good illustration of
how the pieces fit together:

1. **`POST /api/v1/race-sessions`** (`RaceSessionController` →
   `RaceSessionService`) — the client asks for a session for a specific
   course/environment/weather combo. The server checks the pilot's
   `competitive_status`, validates the catalog IDs and that the weather
   preset is valid for that environment, then creates a `race_sessions` row
   with a random `nonce` and a ~15 minute expiry. The nonce is opaque to the
   client; it exists purely so a submission can prove it corresponds to a
   session the server actually issued.

2. Client runs the course, records splits + an optional replay client-side.

3. **`POST /api/v1/race-submissions`** (`RaceSubmissionController` →
   `RaceSubmissionService`) — validated by `RaceSubmissionRequest`
   (structural validation: required fields, types, size caps on
   splits/frames/events). The service:
   - Looks up the submission by `submission_id` first — if a `race_runs` row
     already exists for `(user_id, submission_id)`, it returns the existing
     result instead of reprocessing (idempotency; safe to retry on network
     failure).
   - Loads and locks the referenced `race_sessions` row, checks it's active,
     unexpired, and owned by the caller. A session accepts exactly one
     submission — a second *different* `submission_id` against an
     already-consumed session is a conflict (409); the *same*
     `submission_id` replayed is idempotent (200).
   - Persists a `race_runs` row (+ `race_run_splits`) with `status = pending`
     and stores the replay via `ReplayStorageService`.
   - Dispatches `VerifyRaceRunJob` (runs inline under `QUEUE_CONNECTION=sync`,
     or async on a real queue).

4. **`VerifyRaceRunJob`** loads the run and hands it to
   `RunVerificationService::verify()`, which checks catalog validity,
   physics version, duration bounds, split monotonicity/gate-count, and (if
   a replay was submitted) frame-level sanity — finite numbers, no
   teleports, speed/altitude bounds, monotonic timestamps. See
   [`competitive-integrity.md`](competitive-integrity.md) for the full
   model and its limitations. The result is a status
   (`accepted|rejected|suspicious|manual_review`) plus a suspicion score and
   notes, persisted back onto the run.

5. If the run was accepted, `UpdateLeaderboardJob` upserts the pilot's
   `leaderboard_entries` row for that `(course, weather, rules_version)`
   combination, keeping only their best time. Rejected/suspicious/manual-review
   runs never touch the leaderboard.

6. The client can poll **`GET /api/v1/race-submissions/{submissionId}`** to
   see the final verification outcome (useful since verification may be async).

## Catalog: JSON is the source of truth

`CatalogService` (`app/Domain/Courses/Services/CatalogService.php`) reads
`environments.json`, `courses.json`, `weather-presets.json`, and
`manifest.json` straight from `shared/catalog/` (path configurable via
`FPV_CATALOG_PATH`) and caches the decoded arrays for the life of the
request. There is **no foreign key** from `race_runs`/`race_sessions` to a
catalog table — course/environment/weather IDs are stored as plain strings
and validated against the live JSON at submission time. This means:

- Deploying new courses/environments is just editing JSON + restarting
  workers — no migration needed.
- `environments`/`courses`/`weather_presets` DB tables (`CatalogSeeder`) are
  a convenience *mirror* for admin tooling/reporting only; nothing in the
  hot path queries them.
- If a course is later disabled or marked non-competitive in the JSON,
  existing historical runs referencing it are unaffected, but new sessions
  against it are rejected by `RunVerificationService`/`RaceSessionService`.

## Error format

Every API error (validation, auth, domain, unexpected) is rendered by
`app/Support/ApiError.php` via handlers registered in `bootstrap/app.php`,
so the shape is always:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "The given data was invalid.",
    "details": { "email": ["The email field is required."] },
    "requestId": "b3d2e1a0-..."
  }
}
```

See [`api.md`](api.md#errors) for the full list of error codes.

## Why no Redis/GraphQL/WebSockets/Filament

Per the v0.5 scope: the API is read-mostly and low-traffic enough that
synchronous queue processing (`QUEUE_CONNECTION=sync`) and polling
(`GET /race-submissions/{id}`) are sufficient — no need for WebSockets/SSE.
REST + Form Requests cover the API surface without GraphQL's added
complexity. Redis is supported (as a queue/cache driver) but not required —
`sync` queues and the `database`/`file` cache drivers work fine at this
scale. No admin panel package (Filament) is used; the small admin surface
is a handful of plain JSON endpoints under `admin.` middleware instead.
