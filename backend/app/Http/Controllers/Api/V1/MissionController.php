<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Missions\Models\SeasonMission;
use App\Domain\Seasons\Services\SeasonQueryService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MissionController extends Controller
{
    public function index(Request $request, SeasonQueryService $seasons): JsonResponse
    {
        $season = $seasons->current();
        return response()->json(['missions' => $season ? SeasonMission::where('season_id', $season->id)->with(['progress' => fn ($q) => $q->where('user_id', $request->user()->id)])->get() : []]);
    }
    public function show(Request $request, SeasonMission $mission): JsonResponse { $mission->load(['progress' => fn ($q) => $q->where('user_id', $request->user()->id)]); return response()->json(['mission' => $mission]); }
}
