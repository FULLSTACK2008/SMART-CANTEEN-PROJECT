<?php

namespace Database\Factories;

use App\Models\Student;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Student>
 */
class StudentFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'student_number' => fake()->unique()->bothify('S-####'),
            'full_name' => fake()->name(),
            'gender' => fake()->randomElement(['male', 'female']),
            'class' => fake()->optional()->randomElement(['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3']),
            'photo_path' => null,
            'face_descriptor' => null,
            'guardian_name' => fake()->optional()->name(),
            'guardian_phone' => fake()->optional()->numerify('080########'),
            'balance' => fake()->randomFloat(2, 0, 10000),
            'daily_limit' => null,
            'is_active' => true,
            'notes' => null,
            'managed_by' => User::factory(),
            'created_by' => User::factory(),
        ];
    }
}
