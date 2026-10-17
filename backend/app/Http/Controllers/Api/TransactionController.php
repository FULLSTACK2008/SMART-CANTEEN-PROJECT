<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PurchaseRequest;
use App\Http\Requests\RefundRequest;
use App\Http\Requests\TransactionStoreRequest;
use App\Http\Resources\TransactionResource;
use App\Models\Student;
use App\Models\Transaction;
use App\Services\WalletService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class TransactionController extends Controller
{
    public function __construct(protected WalletService $walletService) {}

    public function deposit(TransactionStoreRequest $request)
    {
        $this->ensureWalletRole($request->user(), ['super-admin', 'patron', 'matron']);

        $student = Student::findOrFail($request->student_id);
        $this->authorize('update', $student);
        $uuid = $request->uuid ?? (string) Str::uuid();

        $existing = Transaction::where('uuid', $uuid)->first();
        if ($existing) {
            return response()->json([
                'message' => 'Deposit already processed.',
                'data' => new TransactionResource($existing),
            ], 200);
        }

        $transaction = $this->walletService->deposit(
            $student,
            (float) $request->amount,
            $request->user(),
            $request->note,
            $uuid,
        );

        return response()->json([
            'message' => 'Deposit successful.',
            'data' => new TransactionResource($transaction),
        ], 201);
    }

    public function purchase(PurchaseRequest $request)
    {
        $this->ensureWalletRole($request->user(), ['super-admin', 'canteen-server']);

        $student = Student::findOrFail($request->student_id);
        $this->authorize('view', $student);

        if (! $student->is_active) {
            return response()->json([
                'code' => 'STUDENT_INACTIVE',
                'message' => 'Purchases are disabled for this student.',
            ], 422);
        }

        $uuid = $request->uuid ?? (string) Str::uuid();

        $existing = Transaction::where('uuid', $uuid)->first();
        if ($existing) {
            return response()->json([
                'message' => 'Purchase already processed.',
                'data' => new TransactionResource($existing),
            ], 200);
        }

        try {
            $transaction = $this->walletService->purchase(
                $student,
                (float) $request->amount,
                $request->user(),
                $request->note,
                null,
                $uuid,
            );

            return response()->json([
                'message' => 'Purchase successful.',
                'data' => new TransactionResource($transaction),
            ], 201);
        } catch (\RuntimeException $e) {
            return response()->json([
                'code' => $e->getMessage(),
                'message' => $e->getMessage() === 'INSUFFICIENT BALANCE'
                    ? 'INSUFFICIENT BALANCE'
                    : 'DAILY LIMIT EXCEEDED',
                'current_balance' => (float) $student->refresh()->balance,
                'daily_limit' => $student->daily_limit === null ? null : (float) $student->daily_limit,
            ], 422);
        }
    }

    public function bulkPurchase(Request $request)
    {
        $this->ensureWalletRole($request->user(), ['super-admin', 'canteen-server']);

        $validated = $request->validate([
            'sales' => ['required', 'array', 'min:1', 'max:200'],
            'sales.*.student_id' => ['required', 'integer', 'distinct', 'exists:students,id'],
            'sales.*.amount' => ['required', 'integer', 'min:1'],
            'sales.*.uuid' => ['required', 'string', 'max:255', 'distinct'],
        ]);

        $transactions = DB::transaction(function () use ($validated, $request) {
            $existingTransactions = Transaction::query()
                ->whereIn('uuid', collect($validated['sales'])->pluck('uuid'))
                ->withCount('relatedTransactions')
                ->get()
                ->keyBy('uuid');

            if ($existingTransactions->isNotEmpty()) {
                if ($existingTransactions->count() !== count($validated['sales'])) {
                    throw ValidationException::withMessages([
                        'sales' => ['This batch was only partially matched to previously processed sales. No new charges were made.'],
                    ]);
                }

                $transactions = [];
                foreach ($validated['sales'] as $index => $sale) {
                    $existing = $existingTransactions->get($sale['uuid']);
                    if (
                        ! $existing
                        || $existing->type !== 'purchase'
                        || (int) $existing->student_id !== (int) $sale['student_id']
                        || (float) $existing->amount !== (float) $sale['amount']
                    ) {
                        throw ValidationException::withMessages([
                            "sales.{$index}.uuid" => ['This sale ID was already used for a different transaction.'],
                        ]);
                    }

                    $student = Student::findOrFail($sale['student_id']);
                    $this->authorize('view', $student);
                    $transactions[] = $existing;
                }

                return $transactions;
            }

            $transactions = [];

            foreach ($validated['sales'] as $index => $sale) {
                $student = Student::findOrFail($sale['student_id']);
                $this->authorize('view', $student);

                if (! $student->is_active) {
                    throw ValidationException::withMessages([
                        "sales.{$index}.student_id" => ['Purchases are disabled for this student account.'],
                    ]);
                }

                if (Transaction::where('uuid', $sale['uuid'])->exists()) {
                    throw ValidationException::withMessages([
                        "sales.{$index}.uuid" => ['This sale has already been processed.'],
                    ]);
                }

                try {
                    $transactions[] = $this->walletService->purchase(
                        $student,
                        (float) $sale['amount'],
                        $request->user(),
                        'Canteen bulk entry',
                        null,
                        $sale['uuid'],
                    );
                } catch (\RuntimeException $e) {
                    throw ValidationException::withMessages([
                        "sales.{$index}.amount" => [$e->getMessage()],
                    ]);
                }
            }

            return $transactions;
        });

        return response()->json([
            'message' => 'Bulk purchases processed successfully.',
            'data' => TransactionResource::collection(collect($transactions)),
        ], 201);
    }

    public function refund(RefundRequest $request)
    {
        $this->ensureWalletRole($request->user(), ['super-admin', 'patron', 'matron']);

        $student = Student::findOrFail($request->student_id);
        $this->authorize('update', $student);
        $uuid = $request->uuid ?? (string) Str::uuid();

        $existing = Transaction::where('uuid', $uuid)->first();
        if ($existing) {
            return response()->json([
                'message' => 'Refund already processed.',
                'data' => new TransactionResource($existing),
            ], 200);
        }

        $transaction = $this->walletService->refund(
            $student,
            (float) $request->amount,
            $request->user(),
            $request->reason,
            $uuid,
        );

        return response()->json([
            'message' => 'Refund successful.',
            'data' => new TransactionResource($transaction),
        ], 201);
    }

    public function reverse(Request $request, Transaction $transaction)
    {
        $user = $request->user();
        $this->ensureWalletRole($user, ['super-admin', 'patron', 'matron', 'canteen-server']);

        $student = Student::findOrFail($transaction->student_id);
        if ($user->hasRole('canteen-server')) {
            $this->authorize('view', $student);
            abort_unless(
                $transaction->type === 'purchase' && (int) $transaction->processed_by === (int) $user->id,
                403,
                'Canteen servers can only reverse their own purchases.'
            );
        } else {
            $this->authorize('update', $student);
        }

        try {
            $reversal = $this->walletService->reverse($transaction, $user);
        } catch (\RuntimeException $e) {
            if ($e->getMessage() === 'TRANSACTION_ALREADY_REVERSED') {
                return response()->json([
                    'message' => 'This transaction has already been reversed.',
                ], 409);
            }

            if ($e->getMessage() === 'INSUFFICIENT BALANCE TO REVERSE DEPOSIT') {
                return response()->json([
                    'message' => 'The student has already spent some of this deposit, so it cannot be fully reversed.',
                ], 422);
            }

            throw $e;
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Transaction reversed.',
            'data' => new TransactionResource($reversal),
        ], 201);
    }

    public function history(Request $request)
    {
        $user = $request->user();
        $this->ensureWalletRole($user, ['super-admin', 'patron', 'matron', 'canteen-server']);

        $query = Transaction::query();

        if ($user->hasRole('patron') || $user->hasRole('matron')) {
            $gender = $user->hasRole('patron') ? 'male' : 'female';
            $query->whereHas('student', function ($studentQuery) use ($user, $gender) {
                $studentQuery->where('gender', $gender)
                    ->where(function ($ownershipQuery) use ($user) {
                        $ownershipQuery->where('managed_by', $user->id)
                            ->orWhere('created_by', $user->id);
                    });
            });
        }

        if ($request->filled('student_id')) {
            $query->where('student_id', $request->student_id);
        }

        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        $query->withCount('relatedTransactions')->latest()->orderByDesc('id');

        if ($request->filled('per_page')) {
            $paginator = $query->paginate(min(max($request->integer('per_page'), 1), 100));

            return response()->json([
                'data' => TransactionResource::collection($paginator->items()),
                'meta' => [
                    'current_page' => $paginator->currentPage(),
                    'last_page' => $paginator->lastPage(),
                    'per_page' => $paginator->perPage(),
                    'total' => $paginator->total(),
                ],
            ]);
        }

        return response()->json([
            'data' => TransactionResource::collection($query->get()),
        ]);
    }

    protected function ensureWalletRole($user, array $roles): void
    {
        if (! $user || ! $user->hasAnyRole($roles)) {
            abort(403, 'You are not allowed to process wallet transactions.');
        }
    }
}
