import { RefundDestinationDto, RefundDestinationType } from './refund-destination.interface';

export type PaymentMethod =
  | 'cash'
  | 'card'
  | 'credit_card'
  | 'bank_transfer'
  | 'qr_promptpay'
  | 'truemoney'
  | 'shopeepay'
  | 'rabbit_linepay'
  | 'other';

export type MobileBankingSourceType =
  | 'mobile_banking_kbank'
  | 'mobile_banking_scb'
  | 'mobile_banking_ktb'
  | 'mobile_banking_bay'
  | 'mobile_banking_bbl'
  | 'mobile_banking_ocbc';

export interface PaymentPayload {
  bookingId: number;
  paymentMethod: PaymentMethod;
  cardToken?: string;
  bankReferenceNumber?: string;
  qrReferenceNumber?: string;
  sourceType?: MobileBankingSourceType;
  phoneNumber?: string;
  amount?: number;
}

export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'refunded'
  | 'manual_refund_required';

export interface PaymentResponse {
  id: number;
  bookingId: number;
  status: PaymentStatus | string;
  paymentMethod: PaymentMethod | string;
  amount: number | string;
  currency: string;
  transactionId?: string;
  failureReason?: string;
  authorizeUri?: string;
  /**
   * OBRS-1351. Omise's OWN PromptPay QR image, forwarded from
   * `charge.source.scannable_code.image.download_uri`. Present only for `qr_promptpay`.
   * Without it the component draws a QR of `authorizeUri`, and a QR of a URL is not an
   * EMVCo payload, so no banking app can pay it.
   */
  qrImageUrl?: string;
  paidAt?: string;
  createdAt?: string;
}

export interface PaymentSummary {
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  refundedAmount?: string;
  currency: string;
  status: string;
}

export interface PaymentTransaction {
  transactionId?: string;
  paymentMethod: string;
  amount: number | string;
  currency: string;
  status: string;
  gatewayResponse?: string;
  paidAt?: string;
  remark?: string;
}

export interface PaymentByBookingIdResponse {
  bookingId: number;
  paymentSummary: PaymentSummary;
  transactions: PaymentTransaction[];
}

export interface PendingRefund {
  paymentId: number;
  bookingId: number;
  bookingNumber?: string;
  customerName?: string;
  contactPhone?: string;
  contactEmail?: string;
  amount: number | string;
  paymentMethod: string;
  paidAt?: string;
  /**
   * OBRS-286 — extended (not forked, design-system §10): the amount actually
   * owed (`COALESCE(mrr.amount_owed, p.amount)`, already computed server-side
   * — SA-SPEC-OBRS-286.md contract #3 / rule 2). The worklist MUST render
   * this, never `amount` above, which overstates a penalty cancel's payout.
   * Never re-derive the coalesce on the FE (FRONTEND-GOTCHAS: mirror the
   * backend's own derivation).
   */
  amountOwed?: number | string;
  /** Any `ERefundReason` (`manual`/`override_cancel`/`schedule_cancel`/
   * `full_cancel`/`reschedule`/`change_stop`/`parcel_cancel`/`parcel_reject`).
   * Distinguishes a cancel-family refund from a still-live reschedule/
   * change-stop downgrade refund. */
  reason?: string;
  destinationType?: RefundDestinationType | null;
  destination?: RefundDestinationDto | null;
  /** `true` unless the caller `hasRole('OWNER')` — the worklist is OWNER-only
   * (K9) so this is always `false` for every reachable row today; render
   * `destination` verbatim regardless, never re-mask on the FE. */
  destinationMasked?: boolean;
  /** `mrr.created_at`, Bangkok-offset ISO string — the queue date (AC-2).
   * `null`-safe: some producers (batch/legacy rows) may carry no queue row. */
  queuedAt?: string | null;
  /**
   * OBRS-1136 AC-4 — the payout clock, both halves derived SERVER-side.
   * `dueDate` is `queuedAt`'s Bangkok date plus `manual_refund_due_days` CALENDAR
   * days, as a bare `YYYY-MM-DD`; `overdue` is whether today in Bangkok is already
   * past it. Calendar days, not business days: the PO decision of 2026-08-08 is
   * that the bus queue trades every day, so there is no day the transfer cannot
   * be made and no weekend to skip.
   *
   * Read them; never re-derive them. The frontend must not carry its own copy of
   * the day count (AC-2: a policy number renders from the API, per the
   * OBRS-564/698/865 precedent), and it could not answer "overdue" honestly in
   * any case — that answer depends on the Bangkok date, not on the browser's
   * clock or timezone. Both are absent for a legacy row with no queue row: no
   * `queuedAt` means no date to count from, and the backend omits `dueDate`
   * rather than invent a deadline the row never had.
   */
  dueDate?: string | null;
  overdue?: boolean;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  numberOfElements: number;
}
