<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request)
    {
        $validated = $request->validate([
            'date' => ['sometimes', 'date_format:Y-m-d'],
        ]);
        $date = $validated['date'] ?? now()->toDateString();

        $notifications = $request->user()
            ->notifications()
            ->whereDate('created_at', $date)
            ->latest()
            ->paginate(50);

        return response()->json($notifications->toArray() + [
            'unread_count' => $request->user()
                ->unreadNotifications()
                ->whereDate('created_at', $date)
                ->count(),
        ]);
    }

    public function unreadCount(Request $request)
    {
        return response()->json([
            'unread_count' => $request->user()
                ->unreadNotifications()
                ->whereDate('created_at', now()->toDateString())
                ->count(),
        ]);
    }

    public function markRead(Request $request, string $notificationId)
    {
        $notification = $request->user()
            ->notifications()
            ->whereKey($notificationId)
            ->firstOrFail();

        $notification->markAsRead();

        return response()->json(['message' => 'Notification marked as read.']);
    }

    public function markAllRead(Request $request)
    {
        $validated = $request->validate([
            'date' => ['sometimes', 'date_format:Y-m-d'],
        ]);
        $date = $validated['date'] ?? now()->toDateString();

        $request->user()
            ->unreadNotifications()
            ->whereDate('created_at', $date)
            ->update(['read_at' => now()]);

        return response()->json(['message' => 'Notifications for this date marked as read.']);
    }
}
