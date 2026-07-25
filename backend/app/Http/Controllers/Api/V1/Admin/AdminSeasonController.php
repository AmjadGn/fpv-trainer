<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Seasons\Models\Season;
use App\Domain\Seasons\Services\SeasonLifecycleService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminSeasonController extends Controller
{
    public function index(Request $request): JsonResponse { return response()->json(Season::orderByDesc('starts_at')->paginate(min(100, max(1, $request->integer('perPage', 25))))); }
    public function show(Season $season): JsonResponse { return response()->json(['season' => $season->load('divisions')]); }
    public function transition(Request $request, Season $season, SeasonLifecycleService $service): JsonResponse
    {
        $action = $request->validate(['action' => ['required', 'in:openRegistration,activate,close,finalize,archive,cancel']])['action'];
        return response()->json(['season' => $service->{$action}($season)]);
    }
}
