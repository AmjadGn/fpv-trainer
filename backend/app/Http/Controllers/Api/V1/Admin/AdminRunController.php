<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Moderation\Services\ModerationService;
use App\Domain\Races\Models\RaceRun;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Admin\ManualReviewRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminRunController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = RaceRun::query()->with('user:id,username')->orderByDesc('submitted_at');

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        $runs = $query->paginate((int) $request->integer('perPage', 25));

        $runs->getCollection()->transform(fn (RaceRun $run) => $this->serialize($run));

        return response()->json($runs);
    }

    public function show(RaceRun $run): JsonResponse
    {
        $run->loadMissing(['splits', 'user:id,username', 'replay']);

        return response()->json(['run' => $this->serialize($run, includeDetail: true)]);
    }

    public function review(ManualReviewRequest $request, RaceRun $run, ModerationService $service): JsonResponse
    {
        $updated = $service->resolveManualReview(
            $request->user(),
            $run,
            $request->input('decision'),
            $request->input('reason'),
            $request->ip(),
        );

        return response()->json(['run' => $this->serialize($updated)]);
    }

    private function serialize(RaceRun $run, bool $includeDetail = false): array
    {
        $data = [
            'id' => $run->id,
            'userId' => $run->user_id,
            'username' => $run->user?->username,
            'courseId' => $run->course_id,
            'durationMs' => $run->duration_ms,
            'status' => $run->status,
            'suspicionScore' => $run->suspicion_score,
            'submittedAt' => optional($run->submitted_at)->toIso8601String(),
        ];

        if ($includeDetail) {
            $data['verificationNotes'] = $run->verification_notes;
            $data['splits'] = $run->splits->map(fn ($split) => ['gateIndex' => $split->gate_index, 'timeMs' => $split->time_ms])->values()->all();
            $data['hasReplay'] = $run->replay !== null;
        }

        return $data;
    }
}
