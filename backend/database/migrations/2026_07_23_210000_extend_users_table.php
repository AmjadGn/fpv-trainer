<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('username', 24)->nullable()->after('id');
            $table->string('display_name')->nullable()->after('username');
            $table->string('country_code', 2)->nullable()->after('display_name');
            $table->string('competitive_status', 16)->default('active')->after('country_code');
            $table->timestamp('suspended_at')->nullable()->after('competitive_status');
            $table->timestamp('accepted_terms_at')->nullable()->after('suspended_at');
            $table->boolean('is_admin')->default(false)->after('accepted_terms_at');
            $table->softDeletes()->after('updated_at');
        });

        // Backfill username for the default 'name' rows created by other seeders/tests
        // before the unique index is applied, then enforce uniqueness.
        Schema::table('users', function (Blueprint $table) {
            $table->unique('username');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['username']);
            $table->dropSoftDeletes();
            $table->dropColumn([
                'username',
                'display_name',
                'country_code',
                'competitive_status',
                'suspended_at',
                'accepted_terms_at',
                'is_admin',
            ]);
        });
    }
};
