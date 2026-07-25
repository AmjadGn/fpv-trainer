<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Features\FeatureFlag;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminFeatureFlagController extends Controller
{
    public function index(): JsonResponse { return response()->json(['flags' => FeatureFlag::orderBy('key')->get()]); }
    public function update(Request $request, FeatureFlag $featureFlag): JsonResponse { $featureFlag->update($request->validate(['enabled' => ['sometimes', 'boolean'], 'targeting' => ['sometimes', 'string'], 'targeting_config_json' => ['sometimes', 'array'], 'description' => ['sometimes', 'string']])); return response()->json(['flag' => $featureFlag->fresh()]); }
}
