<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Progression\Models\PlayerProgress;
use App\Domain\Progression\Services\ProgressMergeService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\ProgressSyncRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProgressController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $progress = PlayerProgress::firstOrCreate(['user_id' => $request->user()->id]);
        $trainingProgress = $request->user()->trainingProgress()->get();
        $achievements = $request->user()->achievements()->pluck('achievement_id');

        return response()->json([
            'progress' => $progress->toApiArray(),
            'trainingProgress' => $trainingProgress->map(fn ($record) => $record->toApiArray())->values()->all(),
            'achievementsUnlocked' => $achievements->values()->all(),
        ]);
    }

    public function merge(ProgressSyncRequest $request, ProgressMergeService $service): JsonResponse
    {
        $progress = $service->merge($request->user(), $request->validated());

        return response()->json(['progress' => $progress->toApiArray()]);
    }

    public function sync(ProgressSyncRequest $request, ProgressMergeService $service): JsonResponse
    {
        $progress = $service->sync($request->user(), $request->validated());

        return response()->json(['progress' => $progress->toApiArray()]);
    }
}
