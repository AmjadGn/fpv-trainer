<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Courses\Services\CatalogService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class CatalogController extends Controller
{
    public function manifest(CatalogService $catalog): JsonResponse
    {
        return response()->json($catalog->manifest());
    }

    public function environments(CatalogService $catalog): JsonResponse
    {
        return response()->json(['environments' => $catalog->environments()]);
    }

    public function courses(CatalogService $catalog): JsonResponse
    {
        return response()->json(['courses' => $catalog->courses()]);
    }

    public function weatherPresets(CatalogService $catalog): JsonResponse
    {
        return response()->json(['weatherPresets' => $catalog->weatherPresets()]);
    }
}
