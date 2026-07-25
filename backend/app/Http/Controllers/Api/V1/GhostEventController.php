<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\GhostEvents\Models\GhostEventAttempt;
use App\Domain\GhostEvents\Services\GhostEventService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\RaceSubmissionRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GhostEventController extends Controller
{
    public function index(GhostEventService $service): JsonResponse { return response()->json(['events' => $service->list()]); }
    public function show(string $slug, GhostEventService $service): JsonResponse { return response()->json(['event' => $service->findBySlug($slug)]); }
    public function bundle(string $slug, GhostEventService $service): JsonResponse { return response()->json(['bundle' => $service->buildBundle($service->findBySlug($slug))]); }
    public function createSession(Request $request, string $slug, GhostEventService $service): JsonResponse { return response()->json(['session' => $service->createSession($request->user(), $service->findBySlug($slug), $request->boolean('practice'), $request->ip())], 201); }
    public function submit(RaceSubmissionRequest $request, string $slug, GhostEventService $service): JsonResponse { return response()->json(['attempt' => $service->submitAttempt($request->user(), $service->findBySlug($slug), $request->validated())], 201); }
    public function leaderboard(Request $request, string $slug, GhostEventService $service): JsonResponse { $event = $service->findBySlug($slug); return response()->json(['entries' => GhostEventAttempt::where('ghost_event_id', $event->id)->where('status', 'accepted')->where('is_practice', false)->with('user:id,username,display_name')->orderBy('rank')->paginate(min(100, max(1, $request->integer('perPage', 25))))]); }
    public function me(Request $request, string $slug, GhostEventService $service): JsonResponse { $event = $service->findBySlug($slug); return response()->json(['attempts' => GhostEventAttempt::where('ghost_event_id', $event->id)->where('user_id', $request->user()->id)->get()]); }
}
