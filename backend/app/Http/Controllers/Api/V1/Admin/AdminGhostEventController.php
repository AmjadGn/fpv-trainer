<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\GhostEvents\Models\GhostEvent;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminGhostEventController extends Controller
{
    public function index(Request $request): JsonResponse { return response()->json(GhostEvent::orderByDesc('starts_at')->paginate(min(100, max(1, $request->integer('perPage', 25))))); }
    public function show(GhostEvent $ghostEvent): JsonResponse { return response()->json(['event' => $ghostEvent->load('benchmarks')]); }
    public function update(Request $request, GhostEvent $ghostEvent): JsonResponse { $ghostEvent->update($request->validate(['enabled' => ['sometimes', 'boolean'], 'max_visible_ghosts' => ['sometimes', 'integer', 'min:1']])); return response()->json(['event' => $ghostEvent->fresh()]); }
}
