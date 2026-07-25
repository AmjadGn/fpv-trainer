<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Integrity\Models\ReviewQueueItem;
use App\Domain\Moderation\Services\ModerationService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminReviewQueueController extends Controller
{
    public function index(Request $request): JsonResponse { return response()->json(ReviewQueueItem::with('raceRun')->where('status', $request->query('status', 'open'))->orderByDesc('priority')->paginate(min(100, max(1, $request->integer('perPage', 25))))); }
    public function review(Request $request, ReviewQueueItem $item, ModerationService $service): JsonResponse
    {
        $data = $request->validate(['decision' => ['required', 'in:accept,reject'], 'reason' => ['required', 'string', 'max:1000']]);
        $run = $service->resolveManualReview($request->user(), $item->raceRun, $data['decision'], $data['reason'], $request->ip());
        $item->update(['status' => 'resolved', 'reviewed_at' => now(), 'reviewed_by' => $request->user()->id, 'review_reason' => $data['reason']]);
        return response()->json(['run' => $run]);
    }
}
