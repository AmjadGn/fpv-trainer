<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Races\Models\RaceSession;
use App\Domain\Races\Services\RaceSessionService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\RaceSessionRequest;
use Illuminate\Http\JsonResponse;

class RaceSessionController extends Controller
{
    public function store(RaceSessionRequest $request, RaceSessionService $service): JsonResponse
    {
        $session = $service->create($request->user(), $request->validated(), $request->ip());

        return response()->json(['session' => $this->serialize($session)], 201);
    }

    private function serialize(RaceSession $session): array
    {
        return [
            'id' => $session->id,
            'courseId' => $session->course_id,
            'environmentId' => $session->environment_id,
            'weatherPresetId' => $session->weather_preset_id,
            'nonce' => $session->nonce,
            'rulesVersion' => $session->rules_version,
            'expiresAt' => $session->expires_at->toIso8601String(),
        ];
    }
}
