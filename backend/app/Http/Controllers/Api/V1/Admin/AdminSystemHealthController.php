<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Seasons\Services\SeasonQueryService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class AdminSystemHealthController extends Controller
{
    public function index(SeasonQueryService $seasons): JsonResponse
    {
        $database = true;
        try { DB::select('select 1'); } catch (\Throwable) { $database = false; }
        return response()->json(['database' => $database, 'season' => $seasons->current(), 'queueConnection' => config('queue.default'), 'cacheStore' => config('cache.default')], $database ? 200 : 503);
    }
}
