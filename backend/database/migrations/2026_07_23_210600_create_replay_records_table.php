<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('replay_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('race_run_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('storage', 16)->default('database');
            $table->string('format', 16)->default('json');
            $table->unsignedInteger('frame_count')->default(0);
            $table->unsignedInteger('size_bytes')->default(0);
            $table->json('payload')->nullable();
            $table->string('disk_path')->nullable();
            $table->timestamp('purge_after')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('replay_records');
    }
};
