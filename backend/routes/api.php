<?php

use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DailyReportController;
use App\Http\Controllers\Api\MenuController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\StudentController;
use App\Http\Controllers\Api\TransactionController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me']);
        Route::patch('/preferences', [AuthController::class, 'updatePreferences']);
    });
});

Route::middleware(['auth:sanctum', 'approved'])->group(function () {
    Route::get('/user', function (Request $request) {
        return $request->user();
    });

    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/reports/daily', [DailyReportController::class, 'show']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::patch('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::patch('/notifications/{notificationId}/read', [NotificationController::class, 'markRead']);

    Route::get('/students/search', [StudentController::class, 'search']);
    Route::get('/students/recycle', [StudentController::class, 'recycle']);
    Route::delete('/students/bulk', [StudentController::class, 'destroyAll']);
    Route::post('/students/{student}/photo', [StudentController::class, 'uploadPhoto']);
    Route::patch('/students/{student}/restore', [StudentController::class, 'restore'])->whereNumber('student');
    Route::delete('/students/{student}/permanent', [StudentController::class, 'forceDelete'])->whereNumber('student');

    Route::get('/menu', [MenuController::class, 'index'])->middleware('role:super-admin');

    Route::resource('students', StudentController::class)
        ->only(['index', 'store', 'show', 'update', 'destroy']);

    Route::prefix('transactions')->group(function () {
        Route::post('/deposit', [TransactionController::class, 'deposit']);
        Route::post('/purchase', [TransactionController::class, 'purchase']);
        Route::post('/purchase/bulk', [TransactionController::class, 'bulkPurchase']);
        Route::post('/refund', [TransactionController::class, 'refund']);
        Route::post('/{transaction}/reverse', [TransactionController::class, 'reverse'])->whereNumber('transaction');
        Route::get('/history', [TransactionController::class, 'history']);
    });

    Route::middleware('role:super-admin')->group(function () {
        Route::get('/admin/dashboard', [AdminController::class, 'dashboard']);
        Route::get('/admin/users', [AdminController::class, 'users']);
        Route::get('/admin/users/{user}/students', [AdminController::class, 'managedStudents']);
        Route::patch('/admin/users/{user}/role', [AdminController::class, 'updateRole']);
        Route::post('/admin/users/{user}/approve', [AdminController::class, 'approve']);
        Route::post('/admin/users/{user}/suspend', [AdminController::class, 'suspend']);
    });
});
