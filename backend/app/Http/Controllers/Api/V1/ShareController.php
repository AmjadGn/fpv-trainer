<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Sharing\Services\ShareService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\ShareRunRequest;
use App\Http\Requests\Api\V1\UpdateVisibilityRequest;
use Illuminate\Http\JsonResponse;

class ShareController extends Controller
{
    public function share(ShareRunRequest $request, int $runId, ShareService $service): JsonResponse
    {
        $share = $service->shareRun(
            $request->user(),
            $runId,
            $request->input('visibility', 'unlisted'),
            $request->input('title'),
        );

        return response()->json(['share' => $this->serialize($share)], 201);
    }

    public function updateVisibility(UpdateVisibilityRequest $request, int $runId, ShareService $service): JsonResponse
    {
        $share = $service->updateVisibility($request->user(), $runId, $request->input('visibility'));

        return response()->json(['share' => $this->serialize($share)]);
    }

    public function publicResult(string $publicId, ShareService $service): JsonResponse
    {
        return response()->json($service->findPublicResult($publicId));
    }

    public function publicReplay(string $publicId, ShareService $service): JsonResponse
    {
        return response()->json($service->findPublicReplay($publicId));
    }

    private function serialize($share): array
    {
        return [
            'publicId' => $share->public_id,
            'runId' => $share->race_run_id,
            'visibility' => $share->visibility,
            'title' => $share->title,
            'publicUrl' => rtrim(config('fpv.app_public_url'), '/')."/results/{$share->public_id}",
        ];
    }
}
