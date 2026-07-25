<?php

namespace App\Domain\Races\Services;

use App\Domain\Courses\Services\CatalogService;
use App\Domain\Races\Models\RaceSession;
use App\Models\User;
use App\Support\ApiException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Creates short-lived race sessions binding a pilot to a course/environment
 * /weather combination. Each session carries a single-use nonce that the
 * eventual submission must echo back (see RunVerificationService).
 */
class RaceSessionService
{
    public function __construct(
        private readonly CatalogService $catalog,
        private readonly int $ttlMinutes,
    ) {
    }

    /**
     * @param array{courseId: string, weatherPresetId: string, clientBuildVersion?: string, physicsVersion?: string, contextType?: string, contextId?: int, mode?: string, contextMetadata?: array<string, mixed>} $data
     */
    public function create(User $user, array $data, ?string $ip = null): RaceSession
    {
        if (!$user->isActive()) {
            throw ApiException::make('account_restricted', 'Your account cannot start competitive race sessions right now.', 403);
        }

        $courseId = $data['courseId'];
        $weatherPresetId = $data['weatherPresetId'];

        $course = $this->catalog->course($courseId);

        if (!$course || !($course['enabled'] ?? false) || !($course['competitive'] ?? false)) {
            throw ApiException::make('unknown_course', 'The requested course is not available for competitive play.', 422);
        }

        $environmentId = $course['environmentId'];
        $environment = $this->catalog->environment($environmentId);

        if (!$environment || !($environment['enabled'] ?? false)) {
            throw ApiException::make('unknown_environment', 'The course environment is not available.', 422);
        }

        $weather = $this->catalog->weatherPreset($weatherPresetId);

        if (!$weather || !($weather['enabled'] ?? false) || !($weather['competitive'] ?? false)) {
            throw ApiException::make('unknown_weather_preset', 'The requested weather preset is not available for competitive play.', 422);
        }

        if (!$this->catalog->isWeatherPresetForEnvironment($weather, $environmentId)) {
            throw ApiException::make('weather_environment_mismatch', 'That weather preset is not available on this course.', 422);
        }

        return DB::transaction(function () use ($user, $courseId, $environmentId, $weatherPresetId, $course, $data, $ip) {
            return RaceSession::create([
                'id' => (string) Str::uuid(),
                'user_id' => $user->id,
                'course_id' => $courseId,
                'environment_id' => $environmentId,
                'weather_preset_id' => $weatherPresetId,
                'nonce' => bin2hex(random_bytes(24)),
                'rules_version' => $course['currentRulesVersion'] ?? 1,
                'physics_version' => $data['physicsVersion'] ?? config('fpv.physics_version'),
                'status' => RaceSession::STATUS_ACTIVE,
                'expires_at' => now()->addMinutes($this->ttlMinutes),
                'ip_address' => $ip,
                'context_type' => $data['contextType'] ?? null,
                'context_id' => $data['contextId'] ?? null,
                'mode' => $data['mode'] ?? 'ranked',
                'context_metadata' => $data['contextMetadata'] ?? null,
            ]);
        });
    }

    public function findOwned(User $user, string $sessionId): RaceSession
    {
        $session = RaceSession::find($sessionId);

        if (!$session) {
            throw ApiException::notFound('Race session not found.');
        }

        if ((int) $session->user_id !== (int) $user->id) {
            throw ApiException::forbidden('This race session does not belong to you.');
        }

        return $session;
    }

    public function markConsumed(RaceSession $session): void
    {
        $session->update([
            'status' => RaceSession::STATUS_CONSUMED,
            'consumed_at' => now(),
        ]);
    }

    /**
     * Cleanup job target: mark stale active sessions as expired.
     */
    public function expireStaleSessions(): int
    {
        return RaceSession::where('status', RaceSession::STATUS_ACTIVE)
            ->where('expires_at', '<', Carbon::now())
            ->update(['status' => RaceSession::STATUS_EXPIRED]);
    }
}
