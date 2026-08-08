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
 * Until this card the danger step was a local `days > 7` — a calendar-day count
 * against a threshold the UI spec itself flagged as "a UX default with no
 * PM/owner sign-off". It has now been signed off, as **7 BUSINESS days** from
 * `manual_refund_requests.created_at`, which is a different number: a row queued
 * on a Friday is 9 calendar days old on the day it first becomes late. Keeping
 * the local threshold would have painted rows red early, on a rule nobody
 * agreed, in a place no config edit could reach — so `overdue` is read from the
 * response and the count lives in `manual_refund_due_business_days` (AC-2).
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
