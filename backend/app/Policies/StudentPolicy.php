<?php

namespace App\Policies;

use App\Models\Student;
use App\Models\User;

class StudentPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasRole(['super-admin', 'patron', 'matron', 'canteen-server']);
    }

    public function view(User $user, Student $student): bool
    {
        if ($user->hasRole('super-admin')) {
            return true;
        }

        if ($user->hasRole('canteen-server')) {
            return true;
        }

        if ($user->hasRole('patron') && $student->gender === 'male') {
            return $user->id === $student->managed_by || $user->id === $student->created_by;
        }

        if ($user->hasRole('matron') && $student->gender === 'female') {
            return $user->id === $student->managed_by || $user->id === $student->created_by;
        }

        return false;
    }

    public function create(User $user): bool
    {
        return $user->hasRole(['super-admin', 'patron', 'matron']);
    }

    public function update(User $user, Student $student): bool
    {
        if ($user->hasRole('super-admin')) {
            return true;
        }

        if ($user->hasRole('patron') && $student->gender === 'male') {
            return $user->id === $student->managed_by || $user->id === $student->created_by;
        }

        if ($user->hasRole('matron') && $student->gender === 'female') {
            return $user->id === $student->managed_by || $user->id === $student->created_by;
        }

        return false;
    }

    public function delete(User $user, Student $student): bool
    {
        return $this->update($user, $student);
    }

    public function restore(User $user, Student $student): bool
    {
        return $this->update($user, $student);
    }

    public function forceDelete(User $user, Student $student): bool
    {
        return $this->update($user, $student);
    }
}
