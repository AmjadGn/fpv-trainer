<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Beta\BetaInvite;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminBetaInviteController extends Controller
{
    public function index(Request $request): JsonResponse { return response()->json(BetaInvite::latest()->paginate(min(100, max(1, $request->integer('perPage', 25))))); }
    public function store(Request $request): JsonResponse { return response()->json(['invite' => BetaInvite::create($request->validate(['code' => ['required', 'string', 'max:64', 'unique:beta_invites,code'], 'usage_limit' => ['required', 'integer', 'min:1'], 'expires_at' => ['nullable', 'date'], 'email_binding' => ['nullable', 'email'], 'campaign' => ['nullable', 'string'], 'enabled' => ['sometimes', 'boolean']]))], 201); }
    public function update(Request $request, BetaInvite $betaInvite): JsonResponse { $betaInvite->update($request->validate(['enabled' => ['sometimes', 'boolean'], 'usage_limit' => ['sometimes', 'integer', 'min:1'], 'expires_at' => ['nullable', 'date']])); return response()->json(['invite' => $betaInvite->fresh()]); }
}
