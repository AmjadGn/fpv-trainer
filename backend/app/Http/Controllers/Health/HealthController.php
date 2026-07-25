<?php

namespace App\Http\Controllers\Health;

use App\Domain\Seasons\Services\SeasonQueryService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class HealthController extends Controller
{
    public function health(): JsonResponse { return response()->json(['status' => 'ok']); }
    public function ready(SeasonQueryService $seasons): JsonResponse
    {
        $checks = ['database' => false, 'cache' => false, 'storage' => false, 'season' => $seasons->current() !== null];
        try { DB::select('select 1'); $checks['database'] = true; } catch (\Throwable) {}
        try { Cache::put('health:ready', true, 10); $checks['cache'] = Cache::get('health:ready') === true; } catch (\Throwable) {}
        try { $checks['storage'] = Storage::disk(config('filesystems.default'))->exists('.health') || Storage::disk(config('filesystems.default'))->put('.health', 'ok'); } catch (\Throwable) {}
        $ready = !in_array(false, $checks, true);
        return response()->json(['status' => $ready ? 'ready' : 'not_ready', 'checks' => $checks], $ready ? 200 : 503);
    }
}
