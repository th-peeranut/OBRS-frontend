// OBRS-286 — manual refund destination capture. Shared by:
//   POST /api/private/bookings/{id}/cancel               (`refundDestination`, customer + act-on-behalf)
//   POST /api/private/admin/bookings/{id}/cancel          (`refundDestination`, OWNER override)
//   GET  /api/private/payments/refunds/pending            (`destination` on each row, admin worklist)
// See SA-SPEC-OBRS-286.md contracts #1/#2/#3. Field names match the wire
// exactly — do not rename or add fields the backend doesn't define.

export type RefundDestinationType = 'bank_account' | 'promptpay';

/** Request-shape payload sent on cancel (contracts #1/#2). */
export interface RefundDestinationReqDto {
  type: RefundDestinationType;
  accountName?: string;
  bank?: string;
  accountNumber?: string;
  promptpayPhone?: string;
}

/** Response-shape destination as it appears on a worklist row (contract #3) —
 * a plain data bag, no `type` discriminant (that's `PendingRefund.destinationType`
 * on the parent row). Verbatim from the backend: raw when the caller is OWNER,
 * already masked (`destinationMasked: true`) otherwise — the FE never re-masks
 * (design-system / FRONTEND-GOTCHAS: don't build a second source of truth for a
 * security transformation the backend already owns). */
export interface RefundDestinationDto {
  accountName?: string;
  bank?: string;
  accountNumber?: string;
  promptpayPhone?: string;
}
