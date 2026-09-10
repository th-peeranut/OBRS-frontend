import { NavigationExtras } from '@angular/router';

/**
 * OBRS-357: the mapping table the card asked for — which `notificationType`
 * an inbox row can be opened INTO, and where it lands.
 *
 * It lives here rather than in the bell because two components need the same
 * answer to two different questions: the panel asks *is this row clickable
 * into something* before it emits `navigate`, and the bell asks *where does
 * it go*. Splitting those across a hardcoded `if` (which is what OBRS-1308
 * left behind, correctly, for a single type) and a `router.navigate` call
 * would let one drift from the other — a row that emits and goes nowhere, or
 * a route nothing can reach.
 *
 * A type is deep-linkable ONLY if its producer sets
 * `notification_log.related_entity_id`; the id here is that column. Measured
 * on `origin/dev` 2026-09-10 (`git grep -n logSentForEntity` in OBRS-backend,
 * main sources only): three producers do — `NOTIF_MSG_OVERRIDE_PENDING`,
 * `CASH_REFUND_APPROVAL_REQUESTED` and `INSPECTION_DEFECT_REPORTED`. The
 * cash-refund one is deliberately NOT here: its approvals page has no
 * per-request deep-link target yet, so adding a row would mean building that
 * page's landing behaviour too — a separate card, not this one.
 */
export interface NotificationDeepLink {
  commands: unknown[];
  extras?: NavigationExtras;
}

export const NOTIFICATION_DEEP_LINKS: Readonly<
  Record<string, (relatedEntityId: number) => NotificationDeepLink>
> = {
  // OBRS-1308, unchanged: the override-review row itself.
  NOTIF_MSG_OVERRIDE_PENDING: (id) => ({
    commands: ['/admin/settings/notification-messages/reviews', id],
  }),
  // OBRS-357: the id is an INSPECTION id, and the vehicles page is keyed by
  // vehicle — so the landing page resolves one into the other server-side
  // (`GET /api/private/inspections/{id}/maintenance-draft`) rather than this
  // map pretending to know the vehicle.
  INSPECTION_DEFECT_REPORTED: (id) => ({
    commands: ['/admin/vehicles'],
    extras: { queryParams: { fromInspection: id } },
  }),
};

/** Whether an inbox row of this type has somewhere to go. */
export function isDeepLinkableNotification(notificationType: string | null | undefined): boolean {
  return (
    !!notificationType &&
    Object.prototype.hasOwnProperty.call(NOTIFICATION_DEEP_LINKS, notificationType)
  );
}
