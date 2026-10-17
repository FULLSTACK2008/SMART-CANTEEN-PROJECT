<?php

namespace Database\Factories;

use App\Models\AuditLog;
use App\Models\Student;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AuditLog>
 */
class AuditLogFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'action' => fake()->randomElement(['created', 'updated', 'deactivated']),
            'auditable_type' => Student::class,
            'auditable_id' => Student::factory(),
            'old_values' => null,
            'new_values' => ['name' => fake()->name()],
            'ip_address' => fake()->ipv4(),
        ];
    }
}
