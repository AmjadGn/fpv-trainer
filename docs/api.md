# API Reference

Base URL: `http://localhost:8000/api/v1` (dev). All requests/responses are
JSON. Authenticated endpoints require `Authorization: Bearer <token>`
(Sanctum personal access token returned by register/login).

- [Errors](#errors)
- [Auth](#auth)
- [Catalog](#catalog)
- [Profile & Pilots](#profile--pilots)
- [Progress](#progress)
- [Ranked races](#ranked-races)
- [Leaderboards](#leaderboards)
- [Challenges](#challenges)
- [Sharing](#sharing)
- [Seasons](#seasons)
- [Tournaments](#tournaments)
- [Ghost Events](#ghost-events)
- [Missions, Rewards & Cosmetics](#missions-rewards--cosmetics)
- [Notifications & Features](#notifications--features)
- [Health](#health)
- [Admin](#admin)

## Errors

Every error response has this shape:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "The given data was invalid.",
    "details": {},
    "requestId": "b3d2e1a0-4f3e-4c9a-9d2a-2f6a1b7c9e10"
  }
}
```

| HTTP | `code` | When |
|---|---|---|
| 401 | `unauthorized` | Missing/invalid bearer token |
| 401 | `invalid_credentials` | Bad login identifier/password (generic, no enumeration) |
| 403 | `forbidden` | Authenticated but not allowed (policy failure, non-admin hitting `admin.*`) |
| 403 | `account_restricted` | Competitive action blocked by `competitive_status` (`restricted`/`banned`/suspended) |
| 404 | `not_found` | Resource doesn't exist or isn't visible to you |
| 409 | `session_conflict` | A *different* `submissionId` was already consumed by this race session |
| 422 | `validation_failed` | Form Request validation failure (`details` = field → messages) |
| 422 | `run_not_shareable` | Tried to share a run that isn't `accepted` |
| 422 | `invalid_reset_token` | Password reset token invalid/expired |
| 429 | `too_many_requests` | Rate limit exceeded (see below) |
| 500 | `internal_error` | Unexpected server error (message hidden unless `APP_DEBUG=true`) |

**Rate limits** (per authenticated user or IP, configurable via
`FPV_RATE_LIMIT_*`): `auth.*` routes 10/min, race/challenge
sessions+submissions 30/min, everything else under `api/v1` 120/min.

## Auth

### `POST /auth/register`

```json
{
  "displayName": "Casey Pilot",
  "username": "caseyp",
  "email": "casey@example.com",
  "password": "correct-horse-battery",
  "password_confirmation": "correct-horse-battery",
  "countryCode": "US",
  "acceptedTerms": true
}
```

- `username`: lowercase, 3–24 chars, `[a-z0-9_]`, not in the reserved list (`admin`, `root`, `support`, ...), unique.
- `countryCode`: optional ISO-3166-1 alpha-2.
- `acceptedTerms`: must be `true`; stamps `accepted_terms_at`.

→ `201`, `{ "user": {...}, "token": "<plaintext-sanctum-token>" }`

### `POST /auth/login`

```json
{ "identifier": "caseyp", "password": "correct-horse-battery", "deviceName": "chrome-desktop" }
```

`identifier` may be a username or email. On success: `{ "user": {...}, "token": "..." }`.
Invalid credentials, unknown identifier, and banned accounts all return the
same generic `401 invalid_credentials` — the API never reveals which part
was wrong or whether the account exists.

### `POST /auth/logout` 🔒

Revokes the token used for the request. `{ "message": "Logged out." }`

### `GET /auth/me` 🔒

`{ "user": { "id", "username", "displayName", "email", "countryCode", "competitiveStatus", "isAdmin", "emailVerifiedAt" } }`

### `POST /auth/forgot-password`

```json
{ "email": "casey@example.com" }
```

Always returns the same generic success message, whether or not the email
exists (Laravel's password broker; `MAIL_MAILER=log` in dev writes the
reset link to `storage/logs/laravel.log`).

### `POST /auth/reset-password`

```json
{ "email": "casey@example.com", "token": "...", "password": "new-password", "password_confirmation": "new-password" }
```

## Catalog

All public, read-only, mirrors `shared/catalog/*.json` via `CatalogService`.

- `GET /catalog` → the manifest (`{"catalogVersion", "physicsVersion", ...}`, see `shared/catalog/manifest.json`)
- `GET /catalog/environments` → `{ "environments": [...] }`
- `GET /catalog/courses` → `{ "courses": [...] }`
- `GET /catalog/weather-presets` → `{ "weatherPresets": [...] }`

## Profile & Pilots

### `GET /profile` 🔒

`{ "profile": { "id", "username", "displayName", "email", "countryCode", "bio", "avatarUrl", "homeEnvironmentId", "isPublic" } }`

### `PATCH /profile` 🔒

Any subset of: `displayName`, `bio`, `avatarUrl`, `countryCode`,
`homeEnvironmentId`, `isPublic`. Returns the updated `{ "profile": {...} }`.

### `POST /profile/export` 🔒

Runs `ExportProfileDataJob` (synchronously by default) and returns the full
export inline — account info, profile, progress, training progress,
achievements, and up to the last 500 race runs (with splits, no replay
blobs). See [`privacy-data-map.md`](privacy-data-map.md).

### `DELETE /profile` 🔒

Anonymizes and soft-deletes the account (`DeleteAccountAction`) — revokes
all tokens, scrubs PII, keeps race history intact for leaderboard/anti-cheat
integrity. `{ "message": "Account deleted." }`

### `GET /pilots/{username}`

Public pilot profile (only if `is_public`). `{ "pilot": { "username", "displayName", "countryCode", "bio", "avatarUrl", "progress": {...} } }` — 404 if not found or private.

### `GET /profile/runs` 🔒

Paginated list of the caller's own race runs (`?page=&perPage=`), newest first.

## Progress

Client-tracked progress (local storage / IndexedDB) reconciled with the
server record. All merges are monotone (max/union), so retrying with the
same payload is a no-op — safe to call on every app boot.

### `GET /progress` 🔒

```json
{
  "progress": { "level": 4, "experiencePoints": 1200, "goldMedals": 2, "silverMedals": 1, "bronzeMedals": 0, "completedRaces": 12, "totalFlightTimeMs": 3600000, "gatesCompleted": 88, "crashes": 5, "bestTimes": { "starter-circuit": 42000 }, "completedTrainingModules": ["hover-basics"] },
  "trainingProgress": [ { "moduleId": "hover-basics", "moduleVersion": 1, "completed": true, "highestMedal": "gold", "bestScore": 950, "bestDurationMs": 30000, "attempts": 3, "bestMetrics": {}, "lastPlayedAt": "..." } ],
  "achievementsUnlocked": ["first-flight", "hover-master"]
}
```

### `POST /progress/merge` 🔒 / `POST /progress/sync` 🔒

Same request/response shape; two endpoints exist to distinguish the
one-time "first login on this device" merge from routine periodic syncs
(both write a `progress_sync_events` row tagged `merge`/`sync` for
auditing). Body:

```json
{
  "progress": { "level": 3, "experiencePoints": 800, "goldMedals": 1, "bestTimes": { "starter-circuit": 45000 }, "completedTrainingModules": ["hover-basics"] },
  "trainingProgress": [ { "moduleId": "gate-basics", "completed": true, "highestMedal": "silver", "bestScore": 700, "attempts": 2 } ],
  "achievementsUnlocked": ["first-flight"]
}
```

Client-reported race best times (`bestTimes`) are stored as informational
personal bests only — they are **never** written to `leaderboard_entries`,
which comes exclusively from server-verified race runs.

## Ranked races

### `POST /race-sessions` 🔒 (throttled)

```json
{ "courseId": "starter-circuit", "weatherPresetId": "calm", "clientBuildVersion": "0.5.0", "physicsVersion": "1.0.0" }
```

Validates the course exists/is enabled/competitive, the weather preset is
enabled/competitive *and valid for the course's environment*, and that the
caller's `competitive_status` is `active`. Creates a session bound to
`(user, course, environment-derived-from-course, weather)` with a random
nonce and a ~15 minute expiry.

→ `201`:

```json
{ "session": { "id": "0199...-uuid", "courseId": "starter-circuit", "environmentId": "alpine-training-valley", "weatherPresetId": "calm", "nonce": "a1b2c3...", "rulesVersion": 1, "expiresAt": "2026-07-23T21:30:00+00:00" } }
```

### `POST /race-submissions` 🔒 (throttled)

The "submission payload v1" — matches the milestone schema:

```json
{
  "submissionVersion": 1,
  "submissionId": "c2b1a0f0-...-uuid-or-client-generated-id",
  "sessionId": "0199...-uuid",
  "course": { "id": "starter-circuit", "version": 1 },
  "environment": { "id": "alpine-training-valley", "version": 1 },
  "weather": { "id": "calm", "version": 1 },
  "client": { "buildVersion": "0.5.0", "physicsVersion": "1.0.0", "replayVersion": 2 },
  "run": {
    "durationMs": 42350,
    "completed": true,
    "crashed": false,
    "splits": [ { "gateIndex": 0, "timeMs": 4200 }, { "gateIndex": 1, "timeMs": 9100 } ],
    "replay": { "metadata": { "frameRateHz": 60 }, "frames": [ { "timestampMs": 0, "position": {"x":0,"y":1.2,"z":0}, "linearVelocity": {"x":0,"y":0,"z":0}, "angularVelocity": {"x":0,"y":0,"z":0}, "orientation": {"x":0,"y":0,"z":0,"w":1} } ] }
  },
  "integrity": { "sessionNonce": "a1b2c3...", "clientDigest": "sha256-or-similar", "events": [] }
}
```

Behavior:

- **Idempotent** by `submissionId` — POSTing the exact same
  `(user, submissionId)` again returns the already-stored result (`201`
  either way; no double-processing).
- A session accepts exactly one submission. A *different* `submissionId`
  against an already-consumed session returns `409 session_conflict`.
- Structural validation (types, required fields, size caps on
  splits/frames/events) happens in `RaceSubmissionRequest`; deeper
  consistency/anti-cheat checks run in `RunVerificationService` (see
  [`competitive-integrity.md`](competitive-integrity.md)) either inline or
  via `VerifyRaceRunJob`, and finish before the response is returned in the
  default `QUEUE_CONNECTION=sync` setup.

→ `201`:

```json
{ "run": { "id": 42, "submissionId": "...", "courseId": "starter-circuit", "environmentId": "alpine-training-valley", "weatherPresetId": "calm", "durationMs": 42350, "completed": true, "crashed": false, "status": "accepted", "verified": true, "suspicionScore": 0, "submittedAt": "...", "splits": [...] } }
```

`status` is one of `pending | accepted | rejected | suspicious | manual_review`.

### `GET /race-submissions/{submissionId}` 🔒

Poll for the (possibly still-processing) result of a submission you own.
Same `run` shape as above. `404` if it's not yours or doesn't exist.

## Leaderboards

### `GET /leaderboards/courses/{courseId}?page=&perPage=`

Public. Only `accepted` runs; one best-time entry per pilot; deterministic
ordering (fastest `bestDurationMs` first, ties broken by lowest entry `id`
— i.e. whoever set the time first keeps the higher rank; ties never
reorder between requests).

```json
{ "courseId": "starter-circuit", "entries": [ { "rank": 1, "userId": 7, "username": "caseyp", "displayName": "Casey Pilot", "bestDurationMs": 41000, "submittedAt": "..." } ], "page": 1, "perPage": 25, "total": 138 }
```

### `GET /leaderboards/around-me?courseId=&window=` 🔒

Returns up to `2*window + 1` entries centered on the caller's own rank
(`window` capped at 25). Same entry shape as above.

## Challenges

Daily/weekly challenges are deterministically generated from
`shared/catalog/challenge-rotation.json` (see
[`challenge-operations.md`](challenge-operations.md)) — `GET /challenges/active`
self-heals by generating today's/this week's instance on demand if the
scheduler hasn't run yet, so the endpoint always has something to return.

### `GET /challenges/active`

```json
{ "challenges": [ { "slug": "industrial-sprint-calm", "pool": "daily", "period": "2026-07-23", "title": "...", "courseId": "industrial-sprint", "environmentId": "...", "weatherPresetId": "calm", "scoringType": "fastest_time", "xpReward": 100, "startsAt": "...", "endsAt": "...", "status": "active" }, { "pool": "weekly", "...": "..." } ] }
```

### `GET /challenges/{slug}` → `{ "challenge": {...} }` (404 if not active)

### `POST /challenges/{slug}/sessions` 🔒 (throttled)

Same shape/semantics as `POST /race-sessions`, scoped to the challenge's
fixed course/environment/weather.

### `POST /challenges/{slug}/submissions` 🔒 (throttled)

Same payload as `POST /race-submissions`. On acceptance, upserts a
`challenge_results` row (best time per pilot per challenge instance) and
awards `medal`/`xpAwarded` per the challenge's `medalThresholdsMs`.

→ `{ "run": { "id", "status", "durationMs", "verified" } }`

### `GET /challenges/{slug}/leaderboard?page=&perPage=`

```json
{ "slug": "industrial-sprint-calm", "entries": [ { "rank": 1, "userId": 7, "username": "caseyp", "displayName": "Casey Pilot", "bestDurationMs": 51200, "medal": "gold", "xpAwarded": 100 } ], "page": 1, "perPage": 25, "total": 40 }
```

## Sharing

### `POST /results/{runId}/share` 🔒

```json
{ "visibility": "unlisted", "title": "My best lap!" }
```

Only the run's owner may share it, and only `accepted` runs are shareable
(`422 run_not_shareable` otherwise). `visibility` ∈ `private|unlisted|public`.

→ `201`: `{ "share": { "publicId": "...", "runId": 42, "visibility": "unlisted", "title": "My best lap!", "publicUrl": "http://localhost:4200/results/<publicId>" } }`

### `PATCH /results/{runId}/visibility` 🔒

```json
{ "visibility": "public" }
```

### `GET /public/results/{publicId}`

No auth. `404` if the share doesn't exist or its visibility is `private`.
Returns an OG-friendly JSON payload (pilot, run summary, splits, view
count) suitable for server-side rendering of share cards.

### `GET /public/replays/{publicId}`

No auth. Same visibility rules; returns `{ "publicId", "replayVersion", "replay": {...} }` for the run's stored replay (`404` if none was stored).

## Seasons

- `GET /seasons/current` — primary active/registration season (or null)
- `GET /seasons/{slug}` — season detail + divisions
- `GET /seasons/history` — completed/archived seasons
- `POST /seasons/{slug}/join` 🔒 — explicit free join
- `GET /seasons/{slug}/me` 🔒 — participant state
- `GET /seasons/{slug}/leaderboard?page=&perPage=` — global seasonal ranking
- `GET /seasons/{slug}/divisions`
- `GET /seasons/{slug}/missions` 🔒
- `GET /seasons/{slug}/rewards` 🔒

## Tournaments

- `GET /tournaments` — featured/active list
- `GET /tournaments/{slug}`
- `POST /tournaments/{slug}/register` 🔒
- `POST /tournaments/{slug}/sessions` 🔒 `{ "practice": true|false }` — practice does not consume attempts
- `POST /tournaments/{slug}/submissions` 🔒 — idempotent on `submissionId`
- `GET /tournaments/{slug}/leaderboard`
- `GET /tournaments/{slug}/me` 🔒

## Ghost Events

- `GET /ghost-events`
- `GET /ghost-events/{slug}`
- `GET /ghost-events/{slug}/bundle` — versioned deterministic conditions + benchmark metadata
- `POST /ghost-events/{slug}/sessions` 🔒
- `POST /ghost-events/{slug}/submissions` 🔒
- `GET /ghost-events/{slug}/leaderboard`
- `GET /ghost-events/{slug}/me` 🔒

## Missions, Rewards & Cosmetics

- `GET /missions` 🔒 / `GET /missions/{id}` 🔒
- `GET /entitlements` 🔒
- `GET /cosmetics`
- `PATCH /loadout` 🔒 `{ "category", "cosmeticKey" }` — server validates ownership

## Notifications & Features

- `GET /features` — server-driven flags + `beta_access_mode`
- `GET /notifications` 🔒
- `POST /notifications/{id}/read` 🔒
- `POST /notifications/read-all` 🔒
- Notification preference endpoints under `/notifications/preferences` when enabled

## Health

Outside `/api/v1`:

- `GET /health` — process alive
- `GET /health/ready` — database/cache/storage/season readiness (no secrets)

## Admin

All under `admin.` middleware (`is_admin = true`); every mutating action
writes an `admin_audit_logs` row via `AuditLogger`.

- `GET /admin/users?status=&search=&perPage=` — paginated user list
- `POST /admin/users/{user}/suspend` `{ "reason": "..." }` → sets `competitive_status = restricted`, stamps `suspended_at`
- `POST /admin/users/{user}/ban` `{ "reason": "..." }` → sets `competitive_status = banned`
- `POST /admin/users/{user}/reinstate` → back to `active`, clears `suspended_at`
- `GET /admin/runs?status=&perPage=` — paginated run list, any status
- `GET /admin/runs/{run}` — full detail incl. verification notes, splits, `hasReplay`
- `POST /admin/runs/{run}/review` `{ "decision": "accepted"|"rejected", "reason": "..." }` — resolves a `manual_review` run (and updates the leaderboard if accepted)
- `GET /admin/challenges?perPage=` — list of all challenge instances
- Admin seasons/tournaments/ghost-events/review-queue/feature-flags/beta-invites/system-health/leaderboard integrity endpoints under `/admin/*`

🔒 = requires `Authorization: Bearer <token>`.
