<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Rewards\Services\EntitlementService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EntitlementController extends Controller
{
    public function index(Request $request, EntitlementService $service): JsonResponse { return response()->json(['entitlements' => $service->listFor($request->user())]); }
}
