# Competitive Integrity (Anti-Cheat Model)

This document describes what `App\Domain\AntiCheat\Services\RunVerificationService`
actually does, and — more importantly — what it *doesn't* do. Read this
before trusting leaderboard data for anything high-stakes.

## The honest summary

**There is no server-authoritative physics simulation.** The server never
re-simulates a flight from raw inputs. It receives a client-reported
result (duration, splits, optionally a replay of position/velocity/
orientation frames) and checks whether that report is *internally
consistent* and *plausible*. A sufficiently motivated cheater who controls
the client binary can fabricate a payload that passes every check below.
This is a **deterrent and triage system**, not cryptographic proof of a
legitimate run. It is designed to:

1. Reject obviously broken/malformed/impossible submissions automatically.
2. Flag borderline submissions for a human to look at (`manual_review`)
   instead of silently accepting or silently rejecting them.
3. Make casual cheating (replaying old sessions, submitting fabricated
   times with no replay, obvious speed hacks) inconvenient, while accepting
   that a determined attacker with client-side access can defeat any
   client-trust-based system.

## What is checked, and how

All checks run in `RunVerificationService::verify(RaceSession $session,
RaceRun $run, ?array $replay)`, against the already-persisted run (so it
works identically whether called inline or from `VerifyRaceRunJob` on a
queue). Checks are split into **hard failures** (any one → `rejected`,
notes explain why) and **soft signals** (accumulate a suspicion score).

### Hard failures → `rejected`

| Check | Rejects when |
|---|---|
| Session validity | The session is not `consumed`/active, is expired, the nonce doesn't match (`hash_equals`), or the session's `user_id`/course/environment/weather doesn't match the run |
| Catalog validity | Course/environment/weather ID isn't in the live catalog JSON, is `enabled: false`, isn't `competitive: true` (course/weather), or the weather preset isn't valid for that environment |
| Physics version | `client.physicsVersion` isn't in `FPV_SUPPORTED_PHYSICS_VERSIONS` |
| Duration bounds | `durationMs` is below the course's `minPlausibleDurationMs` or above `maxDurationMs` (per-course values from the catalog) |
| Split monotonicity | Gate indices or split timestamps go backwards, or the last split time exceeds the reported total duration |
| Replay malformed | Any frame has a non-finite/missing timestamp or position, or non-finite `linearVelocity`/`angularVelocity`/`orientation` values |

### Soft signals → accumulate `suspicion_score`

| Signal | Points | Notes |
|---|---|---|
| Split segment faster than the course's `minSegmentMs` | 10 | Per offending gate |
| Gate count mismatch on a `completed` run | 20 | Expected vs. actual split count differs |
| Missing/empty replay | 10 | Replay is optional but its absence is itself a (weak) signal |
| Replay timestamps non-monotonic | 25 | Per occurrence type, only flagged once per run |
| Speed between consecutive frames exceeds `FPV_ANTICHEAT_MAX_SPEED_MPS` (default 60 m/s) | 20 | Flagged once |
| Position jump between consecutive frames exceeds `FPV_ANTICHEAT_MAX_TELEPORT_M` (default 25 m) | 30 | "Teleport" detector; flagged once |
| Altitude outside `[MIN_ALTITUDE_M, MAX_ALTITUDE_M]` (default -50m to 500m) | 15 | Flagged once |

Final status from the accumulated score (no hard failure):

```
score >= FPV_ANTICHEAT_REJECT_THRESHOLD (default 80)         → rejected
score >= FPV_ANTICHEAT_MANUAL_REVIEW_THRESHOLD (default 40)  → manual_review
score > 0                                                     → suspicious
score == 0                                                     → accepted
```

Only `accepted` runs ever reach `leaderboard_entries` /
`challenge_results`. `suspicious` runs are visible to their owner (with
their true status) but never rank; `manual_review` runs sit in the admin
queue (`GET /admin/runs?status=manual_review`) until
`POST /admin/runs/{run}/review` resolves them one way or the other.

## Known limitations (by design, for v0.5)

- **No re-simulation.** We don't have a deterministic server-side physics
  engine to replay inputs against, so we can't prove a submitted duration
  actually came from flying the course as reported.
- **`clientDigest` is a signal, not a signature.** `integrity.clientDigest`
  is stored (`race_runs.client_digest`) but not currently used to reject
  anything — there's no server-held secret/HMAC scheme yet to make it
  tamper-evident. It's there so a future revision can add real signing
  without a schema change.
- **Nonce prevents replay, not automation.** The session nonce stops someone
  from resubmitting an old/foreign session token, but a bot can legitimately
  request a fresh session before every automated submission — nothing here
  detects "is a human playing this."
- **Heuristic thresholds are guesses.** Speed/teleport/altitude bounds are
  conservative defaults meant to avoid false-positive-rejecting real pilots
  on bad frame rates/network jitter, tunable via `config/fpv.php` /
  `FPV_ANTICHEAT_*` env vars. Expect to tune them against real play data.
  A "fast but real" pilot getting flagged as `suspicious` is an acceptable
  false-positive rate for v0.5 given `manual_review` exists as a backstop.
- **Replay is optional.** A submission with no replay only loses 10
  suspicion points, not a hard rejection — training/casual play shouldn't
  be blocked by a missing replay, but this also means "no replay" is a
  cheap way to skip the frame-level checks entirely. If this system moves
  toward stricter competitive integrity, requiring a replay for leaderboard
  eligibility is the first lever to pull.
- **Single-server trust boundary.** All of this assumes the Laravel app
  itself is trusted infrastructure; it says nothing about protecting
  against a compromised or malicious admin, database access, etc.

## If you need stronger guarantees later

Roughly in order of effort vs. payoff:

1. **Require + fully validate replays** for anything that touches a
   leaderboard (currently optional).
2. **Server-side deterministic re-simulation** of the replay's control
   inputs against the same physics engine, comparing the simulated
   trajectory to the reported one (this is the "real" fix, and a
   substantial undertaking — it means porting/sharing physics code
   between the Angular client and a server-side runner).
3. **Signed client builds** (e.g. a build-time secret baked into official
   client bundles, used to HMAC the submission) so `clientDigest` becomes a
   real integrity check rather than an inert field — raises the bar for
   casual payload forgery without solving the "cheater controls the
   client" problem in general.
4. **Statistical anomaly detection** across a pilot's submission history
   (sudden multi-second improvements, impossible consistency, etc.) as an
   additional `manual_review` trigger, independent of any single run.

## Alpha productization note

# Competitive Integrity

Include physics/aircraft/collider/course/environment/weather/assistance/replay/event rule versions. Do not claim strong anti-cheat from client-only checks.

