<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $superAdmin = User::firstOrCreate(
            ['email' => 'admin@canteen.local'],
            [
                'name' => 'Super Admin',
                'username' => 'superadmin',
                'password' => Hash::make('password123'),
                'status' => 'active',
            ]
        );
        $superAdmin->syncRoles('super-admin');

        $patron = User::firstOrCreate(
            ['email' => 'patron@canteen.local'],
            [
                'name' => 'Boys Patron',
                'username' => 'boys_patron',
                'password' => Hash::make('password123'),
                'status' => 'active',
            ]
        );
        $patron->syncRoles('patron');

        $matron = User::firstOrCreate(
            ['email' => 'matron@canteen.local'],
            [
                'name' => 'Girls Matron',
                'username' => 'girls_matron',
                'password' => Hash::make('password123'),
                'status' => 'active',
            ]
        );
        $matron->syncRoles('matron');

        $server = User::firstOrCreate(
            ['email' => 'server@canteen.local'],
            [
                'name' => 'Canteen Server',
                'username' => 'canteen_server',
                'password' => Hash::make('password123'),
                'status' => 'active',
            ]
        );
        $server->syncRoles('canteen-server');
    }
}
