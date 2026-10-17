<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MenuItem;
use Illuminate\Http\Request;

class MenuController extends Controller
{
    public function index(Request $request)
    {
        abort_unless($request->user()->hasRole('super-admin'), 403);

        $query = MenuItem::query()->where('is_active', true);

        if ($request->filled('category')) {
            $query->where('category', $request->string('category'));
        }

        if ($request->filled('search')) {
            $query->where('name', 'like', '%'.$request->string('search').'%');
        }

        return response()->json([
            'data' => $query->orderBy('category')->orderBy('name')->get()->map(fn (MenuItem $item) => [
                'id' => $item->id,
                'name' => $item->name,
                'price' => (float) $item->price,
                'category' => $item->category,
            ]),
        ]);
    }
}
