<?php

namespace App\Domain\AntiCheat\Services;

use App\Domain\AntiCheat\ValueObjects\VerificationResult;
use App\Domain\Courses\Services\CatalogService;
use App\Domain\Races\Models\RaceRun;
use App\Domain\Races\Models\RaceRunSplit;
use App\Domain\Races\Models\RaceSession;

/**
 * Heuristic run verification ("anti-cheat", loosely speaking).
 *
 * IMPORTANT LIMITATIONS (read before trusting this in production):
 * - This is server-side heuristic validation of a client-reported payload.
 *   A sufficiently motivated cheater who controls the client can still
 *   fabricate a plausible replay that passes every check below — none of
 *   this is cryptographic proof of a legitimate run.
 * - There is no server-authoritative physics simulation. We only check
 *   internal consistency (monotonic time, bounded speed/altitude, no
 *   teleports, finite numbers) of the *client-submitted* replay, not that
 *   it was actually produced by simulating the submitted inputs.
 * - The session nonce prevents replaying a stale/foreign session token but
 *   does not prevent a bot from requesting a fresh session before every
 *   submission.
 * - Suspicion scoring is intentionally conservative (soft signals) to
 *   avoid false-positive rejections of legitimate pilots on imperfect
 *   networks/frame rates; `manual_review` exists so humans can adjudicate
 *   borderline cases instead of the algorithm silently rejecting them.
 *
 * This service reads from the already-persisted RaceRun (+ splits + replay)
 * rather than the raw request payload, so verification can run inline or
 * from a queued job (App\Jobs\VerifyRaceRunJob) with only a run id.
 *
 * See docs/competitive-integrity.md for the full threat model writeup.
 */
class RunVerificationService
{
    private const REASON_SESSION_INVALID = 'session_invalid';
    private const REASON_SESSION_MISMATCH = 'session_mismatch';
    private const REASON_CATALOG_UNKNOWN = 'catalog_unknown_or_disabled';
    private const REASON_PHYSICS_UNSUPPORTED = 'physics_version_unsupported';
    private const REASON_DURATION_OUT_OF_BOUNDS = 'duration_out_of_bounds';
    private const REASON_SPLITS_NON_MONOTONIC = 'splits_non_monotonic';
    private const REASON_REPLAY_NON_FINITE = 'replay_non_finite_values';

    /** @var list<string> */
    private array $hardFailNotes = [];

    /** @var list<string> */
    private array $softNotes = [];

    private int $score = 0;

    public function __construct(
        private readonly CatalogService $catalog,
        private readonly float $maxSpeedMps,
        private readonly float $maxTeleportDistanceM,
        private readonly float $maxAltitudeM,
        private readonly float $minAltitudeM,
        private readonly int $manualReviewThreshold,
        private readonly int $rejectThreshold,
    ) {
    }

    /**
     * @param array{metadata?: array, frames?: array}|null $replay Decoded replay payload, or null if none was stored.
     */
    public function verify(RaceSession $session, RaceRun $run, ?array $replay): VerificationResult
    {
        $this->hardFailNotes = [];
        $this->softNotes = [];
        $this->score = 0;

        $this->checkSession($session, $run);
        $courseCatalog = $this->checkCatalog($run);
        $this->checkPhysicsVersion($run);

        if ($courseCatalog !== null) {
            $this->checkDuration($courseCatalog, $run);
            $this->checkSplits($courseCatalog, $run);
        }

        $this->checkReplay($replay);

        return $this->buildResult();
    }

    private function checkSession(RaceSession $session, RaceRun $run): void
    {
        $nonce = $run->session_nonce;

        if (!$session->isActive() && $session->status !== RaceSession::STATUS_CONSUMED) {
            $this->hardFailNotes[] = self::REASON_SESSION_INVALID.':inactive_or_expired';

            return;
        }

        if (!is_string($nonce) || !hash_equals($session->nonce, $nonce)) {
            $this->hardFailNotes[] = self::REASON_SESSION_INVALID.':nonce_mismatch';

            return;
        }

        if ((int) $session->user_id !== (int) $run->user_id) {
            $this->hardFailNotes[] = self::REASON_SESSION_MISMATCH.':user';

            return;
        }

        if ($session->course_id !== $run->course_id || $session->environment_id !== $run->environment_id || $session->weather_preset_id !== $run->weather_preset_id) {
            $this->hardFailNotes[] = self::REASON_SESSION_MISMATCH.':dimensions';
        }
    }

    private function checkCatalog(RaceRun $run): ?array
    {
        $course = $this->catalog->course($run->course_id);
        $environment = $this->catalog->environment($run->environment_id);
        $weather = $this->catalog->weatherPreset($run->weather_preset_id);

        if (!$course || !($course['enabled'] ?? false) || !($course['competitive'] ?? false)) {
            $this->hardFailNotes[] = self::REASON_CATALOG_UNKNOWN.':course';

            return null;
        }

        if (!$environment || !($environment['enabled'] ?? false)) {
            $this->hardFailNotes[] = self::REASON_CATALOG_UNKNOWN.':environment';

            return null;
        }

        if (!$weather || !($weather['enabled'] ?? false) || !($weather['competitive'] ?? false)) {
            $this->hardFailNotes[] = self::REASON_CATALOG_UNKNOWN.':weather';

            return null;
        }

        if (!$this->catalog->isWeatherPresetForEnvironment($weather, $run->environment_id)) {
            $this->hardFailNotes[] = self::REASON_CATALOG_UNKNOWN.':weather_environment_mismatch';

            return null;
        }

        return $course;
    }

    private function checkPhysicsVersion(RaceRun $run): void
    {
        $supported = config('fpv.supported_physics_versions', []);

        if (!in_array($run->physics_version, $supported, true)) {
            $this->hardFailNotes[] = self::REASON_PHYSICS_UNSUPPORTED.':'.($run->physics_version ?? 'null');
        }
    }

    private function checkDuration(array $course, RaceRun $run): void
    {
        $durationMs = $run->duration_ms;
        $min = $course['minPlausibleDurationMs'] ?? 0;
        $max = $course['maxDurationMs'] ?? PHP_INT_MAX;

        if ($durationMs < $min) {
            $this->hardFailNotes[] = self::REASON_DURATION_OUT_OF_BOUNDS.':faster_than_min_plausible';
        }

        if ($durationMs > $max) {
            $this->hardFailNotes[] = self::REASON_DURATION_OUT_OF_BOUNDS.':exceeds_max_duration';
        }
    }

    private function checkSplits(array $course, RaceRun $run): void
    {
        /** @var \Illuminate\Support\Collection<int, RaceRunSplit> $splits */
        $splits = $run->splits;
        $gateCount = $course['gateCount'] ?? 0;
        $minSegmentMs = $course['minSegmentMs'] ?? 0;
        $durationMs = $run->duration_ms;

        $previousTime = -1;
        $previousGateIndex = -1;

        foreach ($splits as $split) {
            $gateIndex = $split->gate_index;
            $timeMs = $split->time_ms;

            if ($gateIndex <= $previousGateIndex || $timeMs <= $previousTime) {
                $this->hardFailNotes[] = self::REASON_SPLITS_NON_MONOTONIC.':order_or_time';

                return;
            }

            if ($previousTime >= 0 && ($timeMs - $previousTime) < $minSegmentMs) {
                $this->addSoft(10, 'split_segment_too_fast:gate_'.$gateIndex);
            }

            $previousTime = $timeMs;
            $previousGateIndex = $gateIndex;
        }

        if ($previousTime > $durationMs) {
            $this->hardFailNotes[] = self::REASON_SPLITS_NON_MONOTONIC.':split_after_duration';

            return;
        }

        if ($run->completed && $splits->count() !== $gateCount) {
            $this->addSoft(20, 'split_count_mismatch:expected_'.$gateCount.'_got_'.$splits->count());
        }
    }

    /** @param array{metadata?: array, frames?: array}|null $replay */
    private function checkReplay(?array $replay): void
    {
        if (!is_array($replay) || !isset($replay['frames']) || !is_array($replay['frames']) || count($replay['frames']) === 0) {
            $this->addSoft(10, 'replay_missing_or_empty');

            return;
        }

        $frames = $replay['frames'];
        $previousTimestamp = null;
        $previousPosition = null;
        $teleportFlagged = false;
        $speedFlagged = false;
        $altitudeFlagged = false;

        foreach ($frames as $frame) {
            $timestampMs = $frame['timestampMs'] ?? null;
            $position = $frame['position'] ?? null;

            if (!is_numeric($timestampMs) || !$this->isFinite3D($position)) {
                $this->hardFailNotes[] = self::REASON_REPLAY_NON_FINITE;

                return;
            }

            if (!$this->isFiniteVectorFields($frame)) {
                $this->hardFailNotes[] = self::REASON_REPLAY_NON_FINITE;

                return;
            }

            $altitude = $position['y'] ?? 0;
            if (!$altitudeFlagged && ($altitude > $this->maxAltitudeM || $altitude < $this->minAltitudeM)) {
                $this->addSoft(15, 'replay_altitude_out_of_bounds');
                $altitudeFlagged = true;
            }

            if ($previousTimestamp !== null) {
                if ($timestampMs < $previousTimestamp) {
                    $this->addSoft(25, 'replay_timestamp_non_monotonic');
                }

                $dtSeconds = max(($timestampMs - $previousTimestamp) / 1000.0, 0.001);
                $distance = $this->distance3D($previousPosition, $position);
                $speed = $distance / $dtSeconds;

                if (!$speedFlagged && $speed > $this->maxSpeedMps) {
                    $this->addSoft(20, 'replay_speed_exceeds_max');
                    $speedFlagged = true;
                }

                if (!$teleportFlagged && $distance > $this->maxTeleportDistanceM) {
                    $this->addSoft(30, 'replay_possible_teleport');
                    $teleportFlagged = true;
                }
            }

            $previousTimestamp = $timestampMs;
            $previousPosition = $position;
        }
    }

    /** @param array{x?: mixed, y?: mixed, z?: mixed}|null $vector */
    private function isFinite3D(?array $vector): bool
    {
        if ($vector === null) {
            return false;
        }

        foreach (['x', 'y', 'z'] as $axis) {
            $value = $vector[$axis] ?? null;

            if (!is_numeric($value) || !is_finite((float) $value)) {
                return false;
            }
        }

        return true;
    }

    private function isFiniteVectorFields(array $frame): bool
    {
        foreach (['linearVelocity', 'angularVelocity', 'orientation'] as $key) {
            $vector = $frame[$key] ?? null;

            if ($vector === null) {
                continue;
            }

            if (!is_array($vector)) {
                return false;
            }

            foreach ($vector as $value) {
                if (!is_numeric($value) || !is_finite((float) $value)) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * @param array{x: float, y: float, z: float} $a
     * @param array{x: float, y: float, z: float} $b
     */
    private function distance3D(array $a, array $b): float
    {
        $dx = ($b['x'] ?? 0) - ($a['x'] ?? 0);
        $dy = ($b['y'] ?? 0) - ($a['y'] ?? 0);
        $dz = ($b['z'] ?? 0) - ($a['z'] ?? 0);

        return sqrt($dx * $dx + $dy * $dy + $dz * $dz);
    }

    private function addSoft(int $points, string $note): void
    {
        $this->score += $points;
        $this->softNotes[] = $note;
    }

    private function buildResult(): VerificationResult
    {
        if (!empty($this->hardFailNotes)) {
            return VerificationResult::make(
                RaceRun::STATUS_REJECTED,
                100,
                array_merge($this->hardFailNotes, $this->softNotes),
            );
        }

        $status = match (true) {
            $this->score >= $this->rejectThreshold => RaceRun::STATUS_REJECTED,
            $this->score >= $this->manualReviewThreshold => RaceRun::STATUS_MANUAL_REVIEW,
            $this->score > 0 => RaceRun::STATUS_SUSPICIOUS,
            default => RaceRun::STATUS_ACCEPTED,
        };

        return VerificationResult::make($status, $this->score, $this->softNotes);
    }
}
