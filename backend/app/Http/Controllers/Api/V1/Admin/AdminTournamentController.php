<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Tournaments\Models\Tournament;
use App\Domain\Tournaments\Services\TournamentService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminTournamentController extends Controller
{
    public function index(Request $request): JsonResponse { return response()->json(Tournament::orderByDesc('starts_at')->paginate(min(100, max(1, $request->integer('perPage', 25))))); }
    public function show(Tournament $tournament): JsonResponse { return response()->json(['tournament' => $tournament]); }
    public function transition(Request $request, Tournament $tournament, TournamentService $service): JsonResponse { $status = $request->validate(['status' => ['required', 'string']])['status']; return response()->json(['tournament' => $service->transition($tournament, $status)]); }
}
