<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Leaderboards\Models\LeaderboardEntry;
use App\Domain\Leaderboards\Services\LeaderboardService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeaderboardController extends Controller
{
    public function forCourse(Request $request, string $courseId, LeaderboardService $service): JsonResponse
    {
        $page = max(1, (int) $request->integer('page', 1));
        $perPage = min(100, max(1, (int) $request->integer('perPage', 25)));

        $paginator = $service->forCourse($courseId, $perPage, $page);
        $offset = ($paginator->currentPage() - 1) * $paginator->perPage();

        $entries = collect($paginator->items())->values()->map(
            fn (LeaderboardEntry $entry, int $index) => LeaderboardService::serializeEntry($entry, $offset + $index + 1)
        );

        return response()->json([
            'courseId' => $courseId,
            'entries' => $entries->all(),
            'page' => $paginator->currentPage(),
            'perPage' => $paginator->perPage(),
            'total' => $paginator->total(),
        ]);
    }

    public function aroundMe(Request $request, LeaderboardService $service): JsonResponse
    {
        $courseId = (string) $request->query('courseId');

        if ($courseId === '') {
            $courseId = (string) $request->query('course_id', '');
        }

        $window = $service->aroundUser($courseId, $request->user(), min(25, max(1, (int) $request->integer('window', 5))));

        $entries = $window->map(function (LeaderboardEntry $entry) use ($service) {
            return LeaderboardService::serializeEntry($entry, $service->rankFor($entry));
        });

        return response()->json([
            'courseId' => $courseId,
            'entries' => $entries->all(),
        ]);
    }
}
