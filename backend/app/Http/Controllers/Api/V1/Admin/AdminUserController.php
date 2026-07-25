<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Moderation\Services\ModerationService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Admin\ModerationActionRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminUserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = User::query()->orderByDesc('id');

        if ($status = $request->query('status')) {
            $query->where('competitive_status', $status);
        }

        if ($search = $request->query('search')) {
            $query->where(function ($inner) use ($search) {
                $inner->where('username', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $users = $query->paginate((int) $request->integer('perPage', 25));

        $users->getCollection()->transform(fn (User $user) => $this->serialize($user));

        return response()->json($users);
    }

    public function suspend(ModerationActionRequest $request, User $user, ModerationService $service): JsonResponse
    {
        $service->suspendUser($request->user(), $user, $request->input('reason'), $request->ip());

        return response()->json(['user' => $this->serialize($user->refresh())]);
    }

    public function ban(ModerationActionRequest $request, User $user, ModerationService $service): JsonResponse
    {
        $service->banUser($request->user(), $user, $request->input('reason'), $request->ip());

        return response()->json(['user' => $this->serialize($user->refresh())]);
    }

    public function reinstate(Request $request, User $user, ModerationService $service): JsonResponse
    {
        $service->reinstateUser($request->user(), $user, $request->ip());

        return response()->json(['user' => $this->serialize($user->refresh())]);
    }

    private function serialize(User $user): array
    {
        return [
            'id' => $user->id,
            'username' => $user->username,
            'displayName' => $user->display_name,
            'email' => $user->email,
            'competitiveStatus' => $user->competitive_status,
            'suspendedAt' => optional($user->suspended_at)->toIso8601String(),
            'isAdmin' => (bool) $user->is_admin,
            'createdAt' => optional($user->created_at)->toIso8601String(),
        ];
    }
}
