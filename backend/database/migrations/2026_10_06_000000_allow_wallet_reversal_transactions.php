<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->string('type')->change();
        });
    }

    public function down(): void
    {
        if (DB::table('transactions')->where('type', 'reversal')->exists()) {
            throw new RuntimeException('Cannot revert the transaction type while reversal records exist.');
        }

        Schema::table('transactions', function (Blueprint $table) {
            $table->enum('type', ['deposit', 'purchase', 'refund'])->change();
        });
    }
};
