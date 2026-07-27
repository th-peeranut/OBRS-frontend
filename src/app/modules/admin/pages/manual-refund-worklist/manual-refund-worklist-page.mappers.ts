import { PendingRefund } from '../../../../shared/interfaces/payment.interface';

/** Reused `.admin-status.is-*` severity vocabulary (design-system §2.4) —
 * no new colour token for queue-age, per the UI spec's design conformance
 * note #2. Thresholds (fresh <24h / aging 1-7d / stale >7d) are a UX
 * default with no PM/owner sign-off — flagged as such in the UI spec. */
export type QueueAgeSeverity = 'is-neutral' | 'is-warning' | 'is-danger';

/**
 * Days elapsed since `queuedAt` (finding #3: `queuedAt` is null-safe — some
 * producers write no queue row at all). Returns `null` when unknown, never
 * throws on a malformed date.
 */
export function queueAgeDays(
  queuedAt: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!queuedAt) {
    return null;
  }
  const queued = new Date(queuedAt);
  if (!Number.isFinite(queued.getTime())) {
    return null;
  }
  const ms = now.getTime() - queued.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export function queueAgeSeverity(days: number | null): QueueAgeSeverity {
  if (days === null) {
    return 'is-neutral';
  }
  if (days > 7) {
    return 'is-danger';
  }
  if (days >= 1) {
    return 'is-warning';
  }
  return 'is-neutral';
}

/** A NULL destination means the money is owed but the account is unknown
 * (SA rule 6 — batch-originated / reschedule / change-stop / parcel rows) —
 * the row still shows (the owner needs to know money is owed), with a
 * "contact customer" chip instead of bank details. */
export function hasDestination(row: PendingRefund): boolean {
  return !!row.destinationType;
}
