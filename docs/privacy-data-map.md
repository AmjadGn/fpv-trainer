# Privacy & Data Map

What personal data FPV Trainer stores, where, why, and how it's removed.
Written for the v0.5 MVP scope — not a substitute for actual legal review
before handling real users' data in production.

## Data inventory

| Table | Personal data | Purpose | Retention |
|---|---|---|---|
| `users` | `username`, `display_name`, `email`, `country_code` (optional), `password` (hashed) | Account identity/auth | Until deletion (see below); anonymized on `DELETE /profile` |
| `personal_access_tokens` | Sanctum bearer tokens (hashed) | Auth sessions | Deleted on logout/ban/account deletion |
| `pilot_profiles` | `bio`, `avatar_url`, `home_environment_id`, `is_public` | Public profile page | Scrubbed on account deletion |
| `race_runs` | Gameplay telemetry (`duration_ms`, splits, replay), tied to `user_id` | Leaderboards, anti-cheat, personal history | **Kept indefinitely**, even after account deletion — see [Why race history isn't deleted](#why-race-history-isnt-deleted) |
| `replay_records` | Position/velocity/orientation frame data (no PII beyond the implicit link to `user_id` via `race_runs`) | Anti-cheat review, public replay sharing | Purged automatically 30 days after submission for non-`accepted` runs (`purge_after`); kept indefinitely for `accepted` runs unless the run is later deleted |
| `player_progress`, `training_progress`, `user_achievements` | Gameplay progress stats | Cross-device progress sync | Deleted only if the `users` row is hard-deleted (currently soft-delete only) |
| `progress_sync_events` | SHA-256 hash of each sync payload + a small summary (no raw payload stored) | Debugging/audit of merge behavior | Indefinite (small, low-sensitivity) |
| `public_result_shares` | Whatever the pilot opted to make public (`visibility`), `title`, `view_count` | Public share pages | Deleted if the pilot revokes sharing (sets `visibility = private`) or the run is removed |
| `moderation_actions`, `admin_audit_logs` | Admin actions taken against a user (`reason`, `ip_address`, timestamps) | Moderation accountability | Indefinite (compliance/audit trail) |
| `race_sessions` | Ephemeral session binding (`user_id`, course/env/weather, `ip_address`, nonce, optional competitive `context_*`) | Anti-replay, abuse investigation | Deleted by `fpv:race-sessions:cleanup` after expiry |
| `seasons`, `season_participants`, `season_rating_transactions` | Seasonal competitive state (rating, division, points) — not full lifetime progress | Seasons / divisions | Retained as historical season records |
| `tournaments`, `tournament_attempts`, `ghost_events`, `ghost_event_attempts` | Event participation and verified results | Limited-time competition | Event retention policy; accepted metadata kept |
| `user_entitlements`, `user_loadouts`, `cosmetic_definitions` | Owned/equipped cosmetic keys | Cosmetics locker | Until revoke/account deletion |
| `user_notifications`, `notification_preferences` | In-app notification content + email opt-ins | Retention/comms | Expired notifications cleaned; prefs until deletion |
| `beta_invites`, `feature_flags` | Invite codes / rollout config | Public beta control | Operational |
| `review_queue_items`, `integrity_audit_*`, `operational_metrics` | Moderation/ops telemetry (ids, scores — not raw replays in logs) | Integrity & ops | Audit retention |

## What's in a data export (`POST /profile/export`)

`ExportProfileDataAction` returns:

- Account: id, username, display name, email, country code, competitive
  status, created-at, accepted-terms-at.
- Profile: bio, avatar URL, home environment, public flag.
- Progress: player progress stats, training progress per module, unlocked
  achievements.
- Up to the last 500 race runs: course/environment/weather, duration,
  status, completed/crashed flags, submission time, splits.

**Replay frame data is intentionally excluded** from the export to keep
the payload small and because it's raw telemetry rather than
account/identity data — splits (per-gate times) are included as a compact
summary instead. If a pilot specifically wants their replay data, that's a
manual admin/support request for now (not automated in v0.5).

## Account deletion (`DELETE /profile`)

`DeleteAccountAction` runs inside a DB transaction:

1. Revokes all Sanctum tokens (`$user->tokens()->delete()`).
2. Overwrites PII in place: `username` → `deleted-{id}-{random}`,
   `display_name`/`name` → `"Deleted Pilot"`, `email` →
   `deleted-{id}-{random}@fpv-trainer.invalid`, `password` → random
   (unusable) string, `country_code` → `null`.
3. Scrubs the pilot's `pilot_profiles` row (`bio`/`avatar_url` → null,
   `is_public` → false).
4. Soft-deletes the `users` row (`deleted_at` set — the `users` table has
   `SoftDeletes`; nothing currently hard-deletes it).

### Why race history isn't deleted

`race_runs` and `leaderboard_entries` rows are **kept** after account
deletion, just disconnected from any recognizable identity (the
`username`/`display_name` shown alongside them become "Deleted Pilot").
This is a deliberate trade-off:

- Leaderboards need historical entries to stay meaningful/stable for other
  pilots — silently deleting a top entry would be confusing and would make
  rank numbers churn for reasons unrelated to performance.
- Anti-cheat/competitive-integrity investigations sometimes need to look
  back at historical run data across accounts.

If full erasure (not just anonymization) of gameplay history is a hard
requirement for your deployment (e.g. strict GDPR "right to erasure"
interpretation), the next step would be a hard-delete path that also
cascades to `race_runs`/`replay_records`/`leaderboard_entries`/
`public_result_shares` for that user — not implemented here because it
directly trades off against leaderboard integrity, and should be a
deliberate product decision, not a side effect of account deletion.

## Replay storage & security

- Replays are stored as **plain JSON**, either inline in the
  `replay_records.payload` column (small payloads, the common case) or as
  a JSON file under `storage/app/replays/{raceRunId}.json` (payloads over
  512KB). `FPV_MAX_REPLAY_BYTES` (default 2MB) and `FPV_MAX_REPLAY_FRAMES`
  (default 20,000) hard-cap what's accepted at submission time.
- **We never call PHP's `unserialize()` on client-controlled data** — only
  `json_decode()`/`json_encode()` — which eliminates PHP object injection
  as an attack vector for replay payloads.
- `CleanupAbandonedReplaysJob` (scheduled daily at 03:00 via
  `fpv:replays:cleanup`) deletes any `replay_records` row past its
  `purge_after` timestamp. Replays for `accepted` runs have `purge_after =
  null` (kept indefinitely, since they may be publicly shared); replays for
  any other status get a 30-day grace period for manual review before
  automatic deletion.

## IP addresses

`race_sessions.ip_address` and `admin_audit_logs.ip_address` store the
request IP at creation time — used for abuse investigation and admin
accountability, not exposed via any public API response. `race_sessions`
rows (and their IPs) are deleted by the session cleanup job once expired.

## Third parties

- **Mail**: password reset emails go through Laravel's mail system;
  `.env.example` defaults to `MAIL_MAILER=log` (writes to a local log file,
  sends nothing externally) for dev. Configure a real transactional mail
  provider before production and update this doc with whatever provider
  you choose (it will process the recipient's email address).
- **No analytics/tracking, no social login, no third-party SDKs** are
  wired into the backend in this scope — the only external-facing surface
  is the REST API itself.

## Public surfaces (no auth required)

Be aware these are intentionally public once a pilot opts in:

- `GET /pilots/{username}` — if `pilot_profiles.is_public = true` (default).
- `GET /leaderboards/courses/{courseId}` — username/display name/country
  code for every ranked pilot on that course.
- `GET /challenges/{slug}/leaderboard` — same, scoped to a challenge.
- `GET /public/results/{publicId}` / `GET /public/replays/{publicId}` —
  only for runs the owner explicitly shared with `visibility` ∈
  `unlisted|public` (`private` shares 404 for everyone but the owner via
  the authenticated endpoints).
