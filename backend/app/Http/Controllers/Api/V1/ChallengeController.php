<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Challenges\Models\ChallengeResult;
use App\Domain\Challenges\Services\ChallengeQueryService;
use App\Domain\Challenges\Services\ChallengeSubmissionService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\RaceSubmissionRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ChallengeController extends Controller
{
    public function active(ChallengeQueryService $query): JsonResponse
    {
        $instances = $query->active();

        return response()->json([
            'challenges' => $instances->map(fn ($instance) => ChallengeQueryService::serializeInstance($instance))->values()->all(),
        ]);
    }

    public function show(string $slug, ChallengeQueryService $query): JsonResponse
    {
        $instance = $query->findActiveBySlug($slug);

        return response()->json(['challenge' => ChallengeQueryService::serializeInstance($instance)]);
    }

    public function createSession(Request $request, string $slug, ChallengeQueryService $query, ChallengeSubmissionService $service): JsonResponse
    {
        $instance = $query->findActiveBySlug($slug);
        $session = $service->createSession($request->user(), $instance, $request->ip());

        return response()->json([
            'session' => [
                'id' => $session->id,
                'courseId' => $session->course_id,
                'environmentId' => $session->environment_id,
                'weatherPresetId' => $session->weather_preset_id,
                'nonce' => $session->nonce,
                'rulesVersion' => $session->rules_version,
                'expiresAt' => $session->expires_at->toIso8601String(),
            ],
        ], 201);
    }

    public function submit(RaceSubmissionRequest $request, string $slug, ChallengeQueryService $query, ChallengeSubmissionService $service): JsonResponse
    {
        $instance = $query->findActiveBySlug($slug);
        $run = $service->submit($request->user(), $instance, $request->validated());

        return response()->json([
            'run' => [
                'id' => $run->id,
                'status' => $run->status,
                'durationMs' => $run->duration_ms,
                'verified' => $run->isAccepted(),
            ],
        ], 201);
    }

    public function leaderboard(Request $request, string $slug, ChallengeQueryService $query): JsonResponse
    {
        $instance = $query->findActiveBySlug($slug);
        $page = max(1, (int) $request->integer('page', 1));
        $perPage = min(100, max(1, (int) $request->integer('perPage', 25)));

        $paginator = $query->leaderboard($instance, $perPage, $page);
        $offset = ($paginator->currentPage() - 1) * $paginator->perPage();

        $entries = collect($paginator->items())->values()->map(fn (ChallengeResult $result, int $index) => [
            'rank' => $offset + $index + 1,
            'userId' => $result->user_id,
            'username' => $result->user?->username,
            'displayName' => $result->user?->display_name,
            'bestDurationMs' => $result->best_duration_ms,
            'medal' => $result->medal,
            'xpAwarded' => $result->xp_awarded,
        ]);

        return response()->json([
            'slug' => $slug,
            'entries' => $entries->all(),
            'page' => $paginator->currentPage(),
            'perPage' => $paginator->perPage(),
            'total' => $paginator->total(),
        ]);
    }
}
