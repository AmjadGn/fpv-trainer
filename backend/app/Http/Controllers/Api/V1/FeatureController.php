<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Features\FeatureFlagService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FeatureController extends Controller
{
    public function index(Request $request, FeatureFlagService $service): JsonResponse { return response()->json(['features' => $service->getFlags($request->user())]); }
}
