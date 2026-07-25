<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Tournaments\Models\Tournament;
use App\Domain\Tournaments\Models\TournamentAttempt;
use App\Domain\Tournaments\Services\TournamentService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\RaceSubmissionRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TournamentController extends Controller
{
    public function index(TournamentService $service): JsonResponse { return response()->json(['tournaments' => $service->listActiveFeatured()]); }
    public function show(string $slug, TournamentService $service): JsonResponse { return response()->json(['tournament' => $service->findBySlug($slug)]); }
    public function register(Request $request, string $slug, TournamentService $service): JsonResponse { return response()->json(['registration' => $service->register($request->user(), $service->findBySlug($slug))], 201); }
    public function createSession(Request $request, string $slug, TournamentService $service): JsonResponse { $session = $service->createSession($request->user(), $service->findBySlug($slug), $request->boolean('practice'), $request->ip()); return response()->json(['session' => $session], 201); }
    public function submit(RaceSubmissionRequest $request, string $slug, TournamentService $service): JsonResponse { return response()->json(['attempt' => $service->submitAttempt($request->user(), $service->findBySlug($slug), $request->validated())], 201); }
    public function leaderboard(Request $request, string $slug, TournamentService $service): JsonResponse { $tournament = $service->findBySlug($slug); return response()->json(['entries' => TournamentAttempt::where('tournament_id', $tournament->id)->where('status', 'accepted')->where('is_practice', false)->with('user:id,username,display_name')->orderBy('rank')->paginate(min(100, max(1, $request->integer('perPage', 25))))]); }
    public function me(Request $request, string $slug, TournamentService $service): JsonResponse { $tournament = $service->findBySlug($slug); return response()->json(['registration' => $tournament->registrations()->where('user_id', $request->user()->id)->first(), 'attempts' => $tournament->attempts()->where('user_id', $request->user()->id)->get()]); }
}
