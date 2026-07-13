/**
 * OBRS-283: which confirm-dialog variant a schedule/trip row's delete button
 * should show, driven by two NEW read-only backend fields on the schedule
 * list DTOs (`ScheduleRespDto`/`WalkInTripRespDto`): `deletable` and
 * `confirmedBookingCount`.
 *
 * - `delete` — the existing unconditional hard-DELETE flow (unchanged).
 * - `cancel-refund` — soft-cancel via `POST /schedules/{id}/cancel`; at least
 *   one CONFIRMED booking is affected and will be auto-refunded + notified.
 * - `cancel-no-refund` — soft-cancel via the same endpoint, but no CONFIRMED
 *   booking is affected (nothing to refund).
 */
export type ScheduleDeleteModalMode = 'delete' | 'cancel-refund' | 'cancel-no-refund';

/**
 * Resolves the mode for a single row. Uses a STRICT `=== false` check on
 * `deletable` — a cached/stale row that predates this field (undefined) or
 * any row where the backend says it's still hard-deletable (`true`) falls
 * through to the existing DELETE path, never the cancel path. Shared by all
 * 3 call sites (admin schedules, staff schedules, staff sell) so the
 * branching rule can't drift between them.
 */
export function resolveScheduleDeleteModalMode(
  deletable: boolean | null | undefined,
  confirmedBookingCount: number | null | undefined
): ScheduleDeleteModalMode {
  if (deletable !== false) {
    return 'delete';
  }
  return (confirmedBookingCount ?? 0) > 0 ? 'cancel-refund' : 'cancel-no-refund';
}
