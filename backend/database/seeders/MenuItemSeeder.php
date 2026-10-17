<?php

namespace Database\Seeders;

use App\Models\MenuItem;
use Illuminate\Database\Seeder;

class MenuItemSeeder extends Seeder
{
    public function run(): void
    {
        $items = [
            ['name' => 'Jollof Rice', 'price' => 450.00, 'category' => 'main', 'is_active' => true],
            ['name' => 'Beans and Plantain', 'price' => 350.00, 'category' => 'main', 'is_active' => true],
            ['name' => 'Rice and Stew', 'price' => 400.00, 'category' => 'main', 'is_active' => true],
            ['name' => 'Yam Porridge', 'price' => 300.00, 'category' => 'main', 'is_active' => true],
            ['name' => 'Puff Puff', 'price' => 150.00, 'category' => 'snack', 'is_active' => true],
            ['name' => 'Fruit Salad', 'price' => 250.00, 'category' => 'drink', 'is_active' => true],
            ['name' => 'Water Sachet', 'price' => 80.00, 'category' => 'drink', 'is_active' => true],
            ['name' => 'Cocoa Drink', 'price' => 200.00, 'category' => 'drink', 'is_active' => true],
        ];

        foreach ($items as $item) {
            MenuItem::firstOrCreate(
                ['name' => $item['name']],
                $item
            );
        }
    }
}
