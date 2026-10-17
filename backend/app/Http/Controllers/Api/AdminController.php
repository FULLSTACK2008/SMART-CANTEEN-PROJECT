<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\StudentResource;
use App\Http\Resources\UserResource;
use App\Models\Student;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Http\Request;

class AdminController extends Controller
{
    public function dashboard()
    {
        $this->authorize('viewAny', User::class);

        $today = now()->startOfDay();
        $tomorrow = $today->copy()->addDay();

        return response()->json([
            'metrics' => [
                'users_total' => User::count(),
                'users_pending' => User::where('status', 'pending')->count(),
                'users_active' => User::where('status', 'active')->count(),
                'students_total' => Student::count(),
                'students_active' => Student::where('is_active', true)->count(),
                'transactions_today' => Transaction::where('created_at', '>=', $today)
                    ->where('created_at', '<', $tomorrow)
                    ->where('status', 'completed')->count(),
                'sales_today' => (float) Transaction::where('created_at', '>=', $today)
                    ->where('created_at', '<', $tomorrow)
                    ->where('status', 'completed')
                    ->where('type', 'purchase')
                    ->whereDoesntHave('relatedTransactions', fn ($query) => $query->where('type', 'reversal'))
                    ->sum('amount'),
            ],
            'pending_users' => User::with('roles')
                ->where('status', 'pending')
                ->oldest()
                ->limit(8)
                ->get()
                ->map(fn (User $user) => (new UserResource($user))->resolve()),
            'recent_transactions' => Transaction::with([
                'student:id,student_number,full_name',
                'processedBy:id,name',
            ])
                ->latest()
                ->limit(8)
                ->get()
                ->map(fn (Transaction $transaction) => [
                    'id' => $transaction->id,
                    'type' => $transaction->type,
                    'amount' => (float) $transaction->amount,
                    'status' => $transaction->status,
                    'created_at' => $transaction->created_at?->toISOString(),
                    'student' => $transaction->student ? [
                        'id' => $transaction->student->id,
                        'student_number' => $transaction->student->student_number,
                        'full_name' => $transaction->student->full_name,
                    ] : null,
                    'processed_by' => $transaction->processedBy?->name,
                ]),
        ]);
    }

    public function users()
    {
        $this->authorize('viewAny', User::class);

        $users = User::with('roles')
            ->orderByRaw("CASE WHEN status = 'pending' THEN 0 ELSE 1 END")
            ->latest()
            ->get();

        return response()->json([
            'data' => UserResource::collection($users),
        ]);
    }

    public function managedStudents(Request $request, User $user)
    {
        $this->authorize('viewAny', User::class);
        abort_unless($user->hasAnyRole(['patron', 'matron']), 404);

        $gender = $user->hasRole('patron') ? 'male' : 'female';
        $query = Student::withTrashed()
            ->where('gender', $gender)
            ->where(function ($query) use ($user) {
                $query->where('managed_by', $user->id)
                    ->orWhere('created_by', $user->id);
            });

        if ($request->filled('per_page')) {
            $paginator = $query->latest('updated_at')->orderByDesc('id')->paginate(
                min(max($request->integer('per_page'), 1), 100)
            );

            return response()->json([
                'data' => StudentResource::collection($paginator->items()),
                'meta' => [
                    'current_page' => $paginator->currentPage(),
                    'last_page' => $paginator->lastPage(),
                    'per_page' => $paginator->perPage(),
                    'total' => $paginator->total(),
                ],
            ]);
        }

        $students = $query->latest('updated_at')->get();

        return response()->json([
            'data' => StudentResource::collection($students),
        ]);
    }

    public function approve(User $user)
    {
        $this->authorize('approve', User::class);
        $staffRoles = ['patron', 'matron', 'canteen-server'];
        $canApprove = $user->status === 'pending'
            ? $user->hasAnyRole($staffRoles) && ! $user->hasRole('super-admin')
            : $user->hasAnyRole([...$staffRoles, 'super-admin']);

        abort_if(! $canApprove, 422, 'Assign a staff role before approving this account.');

        $user->status = 'active';
        $user->save();

        return response()->json([
            'message' => 'User approved.',
            'data' => new UserResource($user),
        ]);
    }

    public function updateRole(Request $request, User $user)
    {
        $this->authorize('viewAny', User::class);
        abort_if(
            $user->hasRole('super-admin') && $user->status !== 'pending',
            422,
            'Administrator roles cannot be changed here.'
        );

        $validated = $request->validate([
            'role' => ['required', 'string', 'in:patron,matron,canteen-server'],
        ]);

        $user->syncRoles($validated['role']);

        return response()->json([
            'message' => 'User role updated.',
            'data' => new UserResource($user->load('roles')),
        ]);
    }

    public function suspend(Request $request, User $user)
    {
        $this->authorize('suspend', User::class);

        abort_if($request->user()->is($user), 422, 'You cannot suspend your own account.');

        if ($user->hasRole('super-admin')) {
            $activeAdmins = User::role('super-admin')->where('status', 'active')->count();
            abort_if($activeAdmins <= 1, 422, 'The last active administrator cannot be suspended.');
        }

        $user->status = 'suspended';
        $user->save();

        return response()->json([
            'message' => 'User suspended.',
            'data' => new UserResource($user),
        ]);
    }
}
