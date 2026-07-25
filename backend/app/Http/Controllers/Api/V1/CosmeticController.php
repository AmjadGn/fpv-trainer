<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Cosmetics\Services\CosmeticService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CosmeticController extends Controller
{
    public function index(Request $request, CosmeticService $service): JsonResponse { return response()->json(['cosmetics' => $service->listDefinitions(), 'loadout' => $service->getLoadout($request->user())]); }
    public function updateLoadout(Request $request, CosmeticService $service): JsonResponse
    {
        $data = $request->validate(['category' => ['required', 'string', 'max:64'], 'key' => ['nullable', 'string', 'max:128']]);
        $loadout = $data['key'] ? $service->equip($request->user(), $data['category'], $data['key']) : $service->unequip($request->user(), $data['category']);
        return response()->json(['loadout' => $loadout]);
    }
}
