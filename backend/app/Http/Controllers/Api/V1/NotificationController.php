<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Notifications\Models\NotificationPreference;
use App\Domain\Notifications\Services\NotificationService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request, NotificationService $service): JsonResponse { return response()->json($service->paginate($request->user(), min(100, max(1, $request->integer('perPage', 25))))); }
    public function read(Request $request, int $notification, NotificationService $service): JsonResponse { return response()->json(['notification' => $service->markRead($request->user(), $notification)]); }
    public function readAll(Request $request, NotificationService $service): JsonResponse { return response()->json(['updated' => $service->markAllRead($request->user())]); }
    public function preferences(Request $request, NotificationService $service): JsonResponse { return response()->json(['preferences' => $service->ensurePreferences($request->user())]); }
    public function updatePreferences(Request $request, NotificationService $service): JsonResponse
    {
        $keys = ['email_security', 'email_tournament_reminder', 'email_season_ending', 'email_weekly_summary', 'email_engagement_opt_in'];
        $data = $request->validate(collect($keys)->mapWithKeys(fn ($key) => [$key => ['sometimes', 'boolean']])->all());
        $preferences = $service->ensurePreferences($request->user());
        $preferences->update($data);
        return response()->json(['preferences' => $preferences->fresh()]);
    }
}
