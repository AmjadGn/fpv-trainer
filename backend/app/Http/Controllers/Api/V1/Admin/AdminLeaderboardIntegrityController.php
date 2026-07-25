<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Integrity\Services\LeaderboardIntegrityService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminLeaderboardIntegrityController extends Controller
{
    public function audit(Request $request, LeaderboardIntegrityService $service): JsonResponse { return response()->json(['audit' => $service->audit($request->boolean('dryRun', true), $request->user())]); }
    public function rebuild(Request $request, LeaderboardIntegrityService $service): JsonResponse { return response()->json(['audit' => $service->rebuild($request->boolean('dryRun', true))]); }
}
