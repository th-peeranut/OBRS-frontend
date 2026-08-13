/**
 * OBRS-1308 — shared status → chip-class / i18n-key mapping for
 * `notification_message_override.status`, reused by the owner list table and
 * the admin review queue/detail (design-system §2.4: reuse the existing
 * `.admin-status.is-*` legend, no new hex/token).
 *
 * `SUPERSEDED` has no dedicated UI-spec i18n key (it never appears in the
 * owner list — `GET /notification-messages` only ever reports
 * `APPROVED|PENDING|REJECTED|NONE` per locale) and only theoretically reaches
 * the review-detail screen (a proposal viewed after a later edit superseded
 * it); it falls back to the same chip/label as `NONE` rather than inventing
 * an unspecified key.
 */
export function notificationMessageStatusChipClass(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'is-warning';
    case 'APPROVED':
      return 'is-success';
    case 'REJECTED':
      return 'is-danger';
    default:
      return 'is-neutral';
  }
}

export function notificationMessageStatusLabelKey(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'ADMIN.NOTIFICATION_MESSAGES.STATUS.PENDING';
    case 'APPROVED':
      return 'ADMIN.NOTIFICATION_MESSAGES.STATUS.APPROVED';
    case 'REJECTED':
      return 'ADMIN.NOTIFICATION_MESSAGES.STATUS.REJECTED';
    default:
      return 'ADMIN.NOTIFICATION_MESSAGES.STATUS.NONE';
  }
}
