<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Missions\Models\SeasonMission;
use App\Domain\Rewards\Models\LifecycleRewardGrant;
use App\Domain\Seasons\Models\Season;
use App\Domain\Seasons\Services\SeasonLeaderboardService;
use App\Domain\Seasons\Services\SeasonParticipationService;
use App\Domain\Seasons\Services\SeasonQueryService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SeasonController extends Controller
{
    public function current(SeasonQueryService $seasons): JsonResponse { return response()->json(['season' => $seasons->current()?->load('divisions')]); }
    public function show(string $slug, SeasonQueryService $seasons): JsonResponse { return response()->json(['season' => $seasons->bySlug($slug)?->load('divisions') ?? abort(404)]); }
    public function join(Request $request, string $slug, SeasonQueryService $seasons, SeasonParticipationService $participation): JsonResponse { $season = $seasons->bySlug($slug) ?? abort(404); return response()->json(['participant' => $participation->join($request->user(), $season)], 201); }
    public function me(Request $request, string $slug, SeasonQueryService $seasons, SeasonParticipationService $participation): JsonResponse { $season = $seasons->bySlug($slug) ?? abort(404); return response()->json(['participant' => $participation->me($request->user(), $season)]); }
    public function leaderboard(Request $request, string $slug, SeasonQueryService $seasons, SeasonLeaderboardService $leaderboards): JsonResponse { $season = $seasons->bySlug($slug) ?? abort(404); $page = $leaderboards->global($season, min(100, max(1, $request->integer('perPage', 25))), max(1, $request->integer('page', 1))); return response()->json($page); }
    public function divisions(string $slug, SeasonQueryService $seasons): JsonResponse { $season = $seasons->bySlug($slug) ?? abort(404); return response()->json(['divisions' => $season->divisions]); }
    public function history(SeasonQueryService $seasons): JsonResponse { return response()->json(['seasons' => $seasons->history()]); }
    public function missions(Request $request, string $slug, SeasonQueryService $seasons): JsonResponse { $season = $seasons->bySlug($slug) ?? abort(404); return response()->json(['missions' => SeasonMission::where('season_id', $season->id)->with(['progress' => fn ($q) => $q->where('user_id', $request->user()->id)])->get()]); }
    public function rewards(Request $request, string $slug, SeasonQueryService $seasons): JsonResponse { $season = $seasons->bySlug($slug) ?? abort(404); return response()->json(['rewards' => LifecycleRewardGrant::where('source_id', (string) $season->id)->where('user_id', $request->user()->id)->get()]); }
}
