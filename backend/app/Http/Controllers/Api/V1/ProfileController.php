<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Pilots\Actions\DeleteAccountAction;
use App\Domain\Pilots\Actions\UpdateProfileAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\UpdateProfileRequest;
use App\Jobs\ExportProfileDataJob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user = $request->user()->loadMissing('pilotProfile');

        return response()->json(['profile' => $this->serialize($user)]);
    }

    public function update(UpdateProfileRequest $request, UpdateProfileAction $action): JsonResponse
    {
        $user = $action->execute($request->user(), $request->validated());

        return response()->json(['profile' => $this->serialize($user->loadMissing('pilotProfile'))]);
    }

    public function export(Request $request): JsonResponse
    {
        $user = $request->user();

        // Dispatched synchronously so the response stays request/response
        // shaped for the MVP; with a real async QUEUE_CONNECTION this job
        // can run on a worker and the client can poll/download later.
        ExportProfileDataJob::dispatchSync($user->id);

        $path = "exports/user-{$user->id}.json";
        $contents = Storage::disk('local')->exists($path) ? Storage::disk('local')->get($path) : '{}';

        return response()->json(json_decode($contents, true));
    }

    public function destroy(Request $request, DeleteAccountAction $action): JsonResponse
    {
        $action->execute($request->user());

        return response()->json(['message' => 'Account deleted.']);
    }

    private function serialize($user): array
    {
        return [
            'id' => $user->id,
            'username' => $user->username,
            'displayName' => $user->display_name,
            'email' => $user->email,
            'countryCode' => $user->country_code,
            'bio' => $user->pilotProfile?->bio,
            'avatarUrl' => $user->pilotProfile?->avatar_url,
            'homeEnvironmentId' => $user->pilotProfile?->home_environment_id,
            'isPublic' => $user->pilotProfile?->is_public ?? true,
        ];
    }
}
