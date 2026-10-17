<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Transaction;
use Illuminate\Support\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class DailyReportController extends Controller
{
    public function show(Request $request)
    {
        $user = $request->user();
        abort_unless($user->hasAnyRole(['super-admin', 'patron', 'matron', 'canteen-server']), 403);

        $validated = $request->validate([
            'date' => ['sometimes', 'date_format:Y-m-d'],
        ]);
        $date = $validated['date'] ?? now()->toDateString();
        $startOfDay = Carbon::parse($date)->startOfDay();
        $startOfNextDay = $startOfDay->copy()->addDay();
        $genders = $user->hasRole('patron')
            ? ['male']
            : ($user->hasRole('matron') ? ['female'] : ['male', 'female']);

        $groups = collect($genders)->map(function (string $gender) use ($date, $user, $startOfDay, $startOfNextDay) {
            $transactions = Transaction::query()
                ->selectRaw('student_id, COUNT(*) as purchase_count, SUM(amount) as total_spent')
                ->where('type', 'purchase')
                ->where('status', 'completed')
                ->where('created_at', '>=', $startOfDay)
                ->where('created_at', '<', $startOfNextDay)
                ->whereDoesntHave('relatedTransactions', fn ($query) => $query->where('type', 'reversal'))
                ->whereHas('student', function ($query) use ($gender, $user) {
                    $query->where('gender', $gender);

                    if ($user->hasRole('patron') || $user->hasRole('matron')) {
                        $query->where(function ($ownership) use ($user) {
                            $ownership->where('managed_by', $user->id)
                                ->orWhere('created_by', $user->id);
                        });
                    }
                })
                ->with('student:id,student_number,full_name,gender,class,balance,photo_path')
                ->groupBy('student_id')
                ->orderBy('student_id')
                ->get();

            return [
                'gender' => $gender,
                'student_count' => $transactions->count(),
                'purchase_count' => (int) $transactions->sum('purchase_count'),
                'total_spent' => (float) $transactions->sum('total_spent'),
                'students' => $transactions->map(fn (Transaction $transaction) => [
                    'id' => $transaction->student->id,
                    'student_number' => $transaction->student->student_number,
                    'full_name' => $transaction->student->full_name,
                    'gender' => $transaction->student->gender,
                    'class' => $transaction->student->class,
                    'balance' => (float) $transaction->student->balance,
                    'photo_path' => $transaction->student->photo_path,
                    'photo_url' => $transaction->student->photo_path
                        ? (Str::startsWith($transaction->student->photo_path, ['http://', 'https://'])
                            ? $transaction->student->photo_path
                            : Storage::disk('public')->url($transaction->student->photo_path))
                        : null,
                    'purchase_count' => (int) $transaction->purchase_count,
                    'total_spent' => (float) $transaction->total_spent,
                ])->values(),
            ];
        })->values();

        return response()->json([
            'date' => $date,
            'groups' => $groups,
            'total_students' => $groups->sum('student_count'),
            'total_spent' => (float) $groups->sum('total_spent'),
        ]);
    }
}