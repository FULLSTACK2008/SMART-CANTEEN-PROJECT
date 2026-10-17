<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('students', function (Blueprint $table) {
            $table->index(['gender', 'managed_by']);
            $table->index(['gender', 'created_by']);
        });

        Schema::table('transactions', function (Blueprint $table) {
            $table->index(['student_id', 'created_at']);
            $table->index(['type', 'status', 'created_at']);
            $table->index(['related_transaction_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::table('students', function (Blueprint $table) {
            $table->dropIndex(['gender', 'managed_by']);
            $table->dropIndex(['gender', 'created_by']);
        });

        Schema::table('transactions', function (Blueprint $table) {
            $table->dropIndex(['student_id', 'created_at']);
            $table->dropIndex(['type', 'status', 'created_at']);
            $table->dropIndex(['related_transaction_id', 'type']);
        });
    }
};
