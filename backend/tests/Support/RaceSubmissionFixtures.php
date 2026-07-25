<?php

namespace Tests\Support;

use Illuminate\Support\Str;

/**
 * Builds valid (and tweakable) submission-payload fixtures for the
 * starter-circuit course (9 gates) so Feature tests don't have to hand-roll
 * the nested submission-v1 JSON shape every time.
 */
class RaceSubmissionFixtures
{
    public const COURSE_ID = 'starter-circuit';
    public const ENVIRONMENT_ID = 'alpine-training-valley';
    public const WEATHER_ID = 'calm';
    public const GATE_COUNT = 9;

    /**
     * @return array<int, array{gateIndex: int, timeMs: int}>
     */
    public static function validSplits(int $gateCount = self::GATE_COUNT, int $spacingMs = 4500): array
    {
        $splits = [];

        for ($i = 0; $i < $gateCount; $i++) {
            $splits[] = ['gateIndex' => $i, 'timeMs' => ($i + 1) * $spacingMs];
        }

        return $splits;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public static function validFrames(int $count = 10, int $intervalMs = 100): array
    {
        $frames = [];

        for ($i = 0; $i < $count; $i++) {
            $frames[] = [
                'timestampMs' => $i * $intervalMs,
                'position' => ['x' => $i * 0.5, 'y' => 1.5, 'z' => 0.0],
                'linearVelocity' => ['x' => 5.0, 'y' => 0.0, 'z' => 0.0],
                'angularVelocity' => ['x' => 0.0, 'y' => 0.0, 'z' => 0.0],
                'orientation' => ['x' => 0.0, 'y' => 0.0, 'z' => 0.0, 'w' => 1.0],
                'throttle' => 0.5,
                'armed' => true,
                'crashed' => false,
                'currentGateIndex' => 0,
            ];
        }

        return $frames;
    }

    /**
     * Builds a fully-valid submission payload. Pass top-level overrides
     * (e.g. ['run' => [...]], ['integrity' => [...]]) to replace whole
     * sections — sections are replaced wholesale, not deep-merged, so
     * tests stay easy to reason about.
     */
    public static function payload(string $sessionId, string $nonce, array $overrides = []): array
    {
        $base = [
            'submissionVersion' => 1,
            'submissionId' => (string) Str::uuid(),
            'sessionId' => $sessionId,
            'course' => ['id' => self::COURSE_ID, 'version' => 1],
            'environment' => ['id' => self::ENVIRONMENT_ID, 'version' => 1],
            'weather' => ['id' => self::WEATHER_ID, 'version' => 1],
            'client' => ['buildVersion' => '0.5.0', 'physicsVersion' => '1.0.0', 'replayVersion' => 2],
            'run' => [
                'durationMs' => 42000,
                'completed' => true,
                'crashed' => false,
                'splits' => self::validSplits(),
                'replay' => [
                    'metadata' => ['courseId' => self::COURSE_ID],
                    'frames' => self::validFrames(),
                ],
            ],
            'integrity' => [
                'sessionNonce' => $nonce,
                'clientDigest' => 'sha256:test',
                'events' => [],
            ],
        ];

        return array_merge($base, $overrides);
    }
}
