<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

class AuthController extends Controller
{
    public function register(RegisterRequest $request)
    {
        $user = User::create([
            'name' => $request->name,
            'username' => $request->username,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'status' => 'pending',
        ]);

        return response()->json([
            'message' => 'Registration submitted. Awaiting approval.',
            'data' => new UserResource($user),
        ], 201);
    }

    public function login(LoginRequest $request)
    {
        $key = 'login.' . $request->ip();

        if (RateLimiter::tooManyAttempts($key, 5)) {
            return response()->json([
                'message' => 'Too many login attempts. Please wait a little while.',
            ], 429);
        }

        $user = User::where('email', $request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            RateLimiter::hit($key, 60);

            return response()->json([
                'message' => 'Invalid credentials.',
            ], 401);
        }

        if ($user->status !== 'active') {
            return response()->json([
                'message' => 'Your account is pending approval.',
            ], 403);
        }

        RateLimiter::clear($key);

        $token = $user->createToken('canteen-app')->plainTextToken;

        return response()->json([
            'message' => 'Login successful.',
            'token' => $token,
            'data' => new UserResource($user),
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'message' => 'Logged out successfully.',
        ]);
    }

    public function me(Request $request)
    {
        return response()->json([
            'data' => new UserResource($request->user()),
        ]);
    }

    public function updatePreferences(Request $request)
    {
        $preferences = $request->validate([
            'locale' => ['sometimes', 'required', 'in:en,rw,fr'],
            'theme' => ['sometimes', 'required', 'in:light,dark'],
        ]);

        abort_if($preferences === [], 422, 'At least one preference is required.');

        $request->user()->update($preferences);

        return response()->json([
            'data' => new UserResource($request->user()->fresh()),
        ]);
    }
}
