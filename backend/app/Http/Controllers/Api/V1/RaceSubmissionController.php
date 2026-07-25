<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Races\Models\RaceRun;
use App\Domain\Races\Services\RaceSubmissionService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\RaceSubmissionRequest;
use App\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RaceSubmissionController extends Controller
{
    public function store(RaceSubmissionRequest $request, RaceSubmissionService $service): JsonResponse
    {
        $run = $service->submit($request->user(), $request->validated());

        return response()->json(['run' => $this->serialize($run)], 201);
    }

    public function show(Request $request, string $submissionId): JsonResponse
    {
        $run = RaceRun::where('user_id', $request->user()->id)
            ->where('submission_id', $submissionId)
            ->first();

        if (!$run) {
            throw ApiException::notFound('Submission not found.');
        }

        return response()->json(['run' => $this->serialize($run->loadMissing('splits'))]);
    }

    private function serialize(RaceRun $run): array
    {
        return [
            'id' => $run->id,
            'submissionId' => $run->submission_id,
            'courseId' => $run->course_id,
            'environmentId' => $run->environment_id,
            'weatherPresetId' => $run->weather_preset_id,
            'durationMs' => $run->duration_ms,
            'completed' => $run->completed,
            'crashed' => $run->crashed,
            'status' => $run->status,
            'verified' => $run->isAccepted(),
            'suspicionScore' => $run->suspicion_score,
            'submittedAt' => optional($run->submitted_at)->toIso8601String(),
            'splits' => $run->relationLoaded('splits')
                ? $run->splits->map(fn ($split) => ['gateIndex' => $split->gate_index, 'timeMs' => $split->time_ms])->values()->all()
                : null,
        ];
    }
}
