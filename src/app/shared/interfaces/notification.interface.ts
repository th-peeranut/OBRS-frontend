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
  /**
   * OBRS-1308: same shape as `bookingScheduleId` above — the id of the entity
   * this notification is about, resolved by the panel to build a deep link
   * (currently only `NOTIF_MSG_OVERRIDE_PENDING` → the override review row).
   * Optional/nullable so a payload predating this field (and every existing
   * fixture literal in notification-inbox-panel/-row/-inbox.service specs)
   * still type-checks without a per-fixture edit — a client that never reads
   * it sees no behavior change.
   */
  relatedEntityId?: number | null;
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
