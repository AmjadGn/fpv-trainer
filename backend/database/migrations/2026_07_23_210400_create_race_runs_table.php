<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('race_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('race_session_id')->nullable()->constrained('race_sessions')->nullOnDelete();
            $table->string('submission_id', 64);
            $table->string('course_id');
            $table->string('environment_id');
            $table->string('weather_preset_id');
            $table->unsignedInteger('course_version')->default(1);
            $table->unsignedInteger('environment_version')->default(1);
            $table->unsignedInteger('weather_preset_version')->default(1);
            $table->string('physics_version');
            $table->string('client_build_version')->nullable();
            $table->unsignedInteger('replay_version')->default(1);
            $table->unsignedInteger('submission_version')->default(1);
            $table->unsignedInteger('duration_ms');
            $table->unsignedSmallInteger('gate_count')->default(0);
            $table->boolean('completed')->default(false);
            $table->boolean('crashed')->default(false);
            $table->string('status', 20)->default('pending');
            $table->unsignedSmallInteger('suspicion_score')->default(0);
            $table->json('verification_notes')->nullable();
            $table->string('session_nonce', 64)->nullable();
            $table->string('client_digest', 128)->nullable();
            $table->json('client_metadata')->nullable();
            $table->timestamp('submitted_at');
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'submission_id']);
            $table->index(['course_id', 'status', 'duration_ms']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('race_runs');
    }
};
