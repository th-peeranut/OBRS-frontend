// OBRS-317: owner/staff in-app notification inbox (Phase 1, poll-based).
// Role-agnostic — served under /api/private/notifications to any
// authenticated back-office user (admin, owner, salesperson, driver).

/** A single in-app notification row, as returned inside the `PageResponse`
 * `content` array (see `PageResponse<T>` in `payment.interface.ts` — reused
 * as-is, no new Page type). */
export interface NotificationItem {
  id: number;
  message: string;
  notificationType: string;
  channel: 'IN_APP';
  status: string;
  bookingScheduleId: number | null;
  targetDate: string | null;
  sentAt: string;
  readAt: string | null;
  read: boolean;
}

/** `GET /api/private/notifications/unread-count` response `data`. */
export interface NotificationUnreadCountDto {
  unreadCount: number;
}

/** `POST /api/private/notifications/{id}/read` response `data`. */
export interface NotificationMarkReadResultDto {
  id: number;
  readAt: string;
  read: boolean;
}

/** `POST /api/private/notifications/read-all` response `data`. */
export interface NotificationMarkAllReadResultDto {
  updatedCount: number;
}
