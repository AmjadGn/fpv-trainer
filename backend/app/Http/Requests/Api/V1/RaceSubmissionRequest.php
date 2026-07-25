<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the "submission payload v1" documented in docs/api.md. Deep
 * frame-by-frame replay validation (finite numbers, speed, teleports) is
 * intentionally left to RunVerificationService rather than the validator,
 * both for performance and because those are soft anti-cheat signals, not
 * hard input errors.
 */
class RaceSubmissionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $maxSplits = config('fpv.max_splits_per_run');
        $maxEvents = config('fpv.max_events_per_run');
        $maxFrames = config('fpv.max_replay_frames');

        return [
            'submissionVersion' => ['required', 'integer'],
            'submissionId' => ['required', 'string', 'max:64'],
            'sessionId' => ['required', 'uuid'],

            'course' => ['required', 'array'],
            'course.id' => ['required', 'string', 'max:100'],
            'course.version' => ['required', 'integer', 'min:1'],

            'environment' => ['required', 'array'],
            'environment.id' => ['required', 'string', 'max:100'],
            'environment.version' => ['required', 'integer', 'min:1'],

            'weather' => ['required', 'array'],
            'weather.id' => ['required', 'string', 'max:100'],
            'weather.version' => ['required', 'integer', 'min:1'],

            'client' => ['required', 'array'],
            'client.buildVersion' => ['nullable', 'string', 'max:32'],
            'client.physicsVersion' => ['required', 'string', 'max:32'],
            'client.replayVersion' => ['required', 'integer', 'min:1'],

            'run' => ['required', 'array'],
            'run.durationMs' => ['required', 'integer', 'min:1', 'max:3600000'],
            'run.completed' => ['required', 'boolean'],
            'run.crashed' => ['required', 'boolean'],
            'run.splits' => ['present', 'array', "max:{$maxSplits}"],
            'run.splits.*.gateIndex' => ['required', 'integer', 'min:0'],
            'run.splits.*.timeMs' => ['required', 'integer', 'min:0'],
            'run.replay' => ['nullable', 'array'],
            'run.replay.metadata' => ['nullable', 'array'],
            'run.replay.frames' => ['nullable', 'array', "max:{$maxFrames}"],

            'integrity' => ['required', 'array'],
            'integrity.sessionNonce' => ['required', 'string', 'max:64'],
            'integrity.clientDigest' => ['nullable', 'string', 'max:128'],
            'integrity.events' => ['nullable', 'array', "max:{$maxEvents}"],
        ];
    }
}
