<?php

namespace App\Policies;

use App\Models\User;

class UserPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasRole('super-admin');
    }

    public function update(User $user, User $target): bool
    {
        return $user->hasRole('super-admin') || $user->id === $target->id;
    }

    public function approve(User $user): bool
    {
        return $user->hasRole('super-admin');
    }

    public function suspend(User $user): bool
    {
        return $user->hasRole('super-admin');
    }
}
