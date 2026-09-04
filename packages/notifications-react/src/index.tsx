/**
 * @gigalibs/notifications-react
 *
 * Real-time notification bell and dropdown inbox UI components.
 *
 * @module
 */

import * as React from 'react';
import type { Notification } from '@gigalibs/contracts';

export const NotificationBell: React.FC<{
  unreadCount?: number;
  onClick?: () => void;
}> = ({ unreadCount = 0, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="relative p-2 rounded-full text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
};

export const NotificationInbox: React.FC<{
  notifications: Notification[];
  onMarkRead?: (id: string) => void;
}> = ({ notifications, onMarkRead }) => {
  return (
    <div className="w-80 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <h4 className="font-semibold text-sm text-slate-900">Notifications</h4>
        <span className="text-xs text-slate-400">{notifications.length} Total</span>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
        {notifications.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">No notifications yet</div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => onMarkRead?.(n.id)}
              className={`p-3.5 hover:bg-slate-50 cursor-pointer transition-colors ${
                n.status !== 'read' ? 'bg-blue-50/40' : ''
              }`}
            >
              <div className="text-xs font-semibold text-slate-800 mb-0.5">{n.title}</div>
              <div className="text-xs text-slate-500 line-clamp-2">{n.body}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
