<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('race_run_splits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('race_run_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('gate_index');
            $table->unsignedInteger('time_ms');
            $table->timestamps();

            $table->unique(['race_run_id', 'gate_index']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('race_run_splits');
    }
};
