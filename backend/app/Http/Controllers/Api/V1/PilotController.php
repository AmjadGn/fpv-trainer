<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Pilots\Queries\PublicPilotProfileQuery;
use App\Domain\Races\Models\RaceRun;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PilotController extends Controller
{
    public function show(string $username, PublicPilotProfileQuery $query): JsonResponse
    {
        return response()->json(['pilot' => $query->execute($username)]);
    }

    public function runs(Request $request): JsonResponse
    {
        $runs = RaceRun::where('user_id', $request->user()->id)
            ->orderByDesc('submitted_at')
            ->paginate((int) $request->integer('perPage', 25));

        $runs->getCollection()->transform(fn (RaceRun $run) => [
            'id' => $run->id,
            'courseId' => $run->course_id,
            'environmentId' => $run->environment_id,
            'weatherPresetId' => $run->weather_preset_id,
            'durationMs' => $run->duration_ms,
            'status' => $run->status,
            'completed' => $run->completed,
            'crashed' => $run->crashed,
            'submittedAt' => optional($run->submitted_at)->toIso8601String(),
        ]);

        return response()->json($runs);
    }
}
