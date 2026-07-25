<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Challenges\Models\ChallengeInstance;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminChallengeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ChallengeInstance::query()->with('definition')->orderByDesc('starts_at');

        if ($pool = $request->query('pool')) {
            $query->where('pool', $pool);
        }

        $instances = $query->paginate((int) $request->integer('perPage', 25));

        $instances->getCollection()->transform(fn (ChallengeInstance $instance) => [
            'id' => $instance->id,
            'slug' => $instance->definition->slug,
            'title' => $instance->definition->title,
            'pool' => $instance->pool,
            'period' => $instance->period,
            'status' => $instance->status,
            'startsAt' => $instance->starts_at->toIso8601String(),
            'endsAt' => $instance->ends_at->toIso8601String(),
        ]);

        return response()->json($instances);
    }
}
