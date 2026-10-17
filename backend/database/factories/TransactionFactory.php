<?php

namespace Database\Factories;

use App\Models\Student;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Transaction>
 */
class TransactionFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'uuid' => (string) Str::uuid(),
            'student_id' => Student::factory(),
            'type' => 'purchase',
            'amount' => 500.00,
            'balance_before' => 1000.00,
            'balance_after' => 500.00,
            'items' => null,
            'note' => null,
            'processed_by' => User::factory(),
            'related_transaction_id' => null,
            'status' => 'completed',
            'client_created_at' => null,
        ];
    }
}
