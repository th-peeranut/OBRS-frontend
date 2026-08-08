import { PendingRefund } from '../../../../shared/interfaces/payment.interface';

/** Reused `.admin-status.is-*` severity vocabulary (design-system §2.4) —
 * no new colour token for queue-age, per the UI spec's design conformance
 * note #2. */
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

/**
 * OBRS-1136 AC-4: red means PAST DUE, and only the server can say so.
 *
 * Until this card the danger step was a local `days > 7` — a threshold the UI
 * spec itself flagged as "a UX default with no PM/owner sign-off". It has now
 * been signed off as **7 calendar days** from `manual_refund_requests.created_at`,
 * so the number survived. What did not survive is where it was computed:
 *
 * * `queueAgeDays` measures ELAPSED HOURS and floors them. A row queued at 23:00
 *   is 7.5 days old on the morning of its eighth day, floors to 7, and stayed
 *   amber while the published deadline had already passed. The old rule was
 *   therefore late, by up to a day, on every row queued in the evening.
 * * It floored against `new Date()` — the VIEWER's clock and timezone. Whether a
 *   refund is late is a fact about the Bangkok date, and an owner opening the
 *   worklist from another timezone got a different answer to the same question.
 * * It was a literal in a bundle. The count now lives in `manual_refund_due_days`
 *   (AC-2), where moving it is a config edit rather than a three-language deploy,
 *   and where `/refund-policy` reads the SAME key it is announced from.
 *
 * So `overdue` is read from the response and never recomputed here.
 *
 * `days` still drives the two non-red steps: how long a row has been waiting is
 * the operator's own triage signal and needs no policy behind it.
 */
export function queueAgeSeverity(
  days: number | null,
  overdue: boolean | undefined = false
): QueueAgeSeverity {
  if (overdue) {
    return 'is-danger';
  }
  if (days !== null && days >= 1) {
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
