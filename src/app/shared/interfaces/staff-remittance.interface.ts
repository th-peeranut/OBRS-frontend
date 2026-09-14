/**
 * OBRS-1755 — the salesperson's OWN cash position for ONE round, and the
 * "ส่งยอด" submit that hands it to the owner.
 *
 * Shapes follow `SA-OBRS-1755-settlement-tab.md` §2 contracts A and B. This is
 * deliberately NOT `settlement.interface.ts`: that file is the OWNER's
 * `GET /settlements/schedules/{id}`, whose payload carries `settled`,
 * `discrepancy` and every seller's money. A salesperson must never receive it
 * (spec §2A), so the two shapes stay apart rather than one growing optional
 * fields that would make "which surface am I on" a runtime question.
 *
 * Money fields are DECIMAL STRINGS ("2020.00"), the convention the settlement
 * and reports DTOs already use — never arithmetic on them as strings, and
 * never a currency symbol on the wire. `myExpectedCash` is SIGNED: a round can
 * legitimately owe the salesperson money (BR-4), so nothing here is clamped
 * at zero, on the wire or on screen.
 */

/** Round-level state. `SUBMITTED` is computed by the server, never stored (spec §1). */
export type StaffRemittanceStatus = 'PENDING' | 'SUBMITTED' | 'SETTLED';

/**
 * Where this counter's ticket cash goes (BR-6). `ROUND` = counted into the
 * owner's hands at the end of this round (หนองชาก); `DAY` = kept in the drawer
 * and transferred at close of day (บ้านบึง / หมอชิต).
 *
 * ⛔ Server-derived from `sales_points.ticket_cash_remit_cadence`. The screen
 * never offers this as a choice and never keys off a stop name.
 */
export type StaffRemitCadence = 'ROUND' | 'DAY';

/** One price/occupant bucket of the seller's own tickets. */
export interface StaffRemittanceFareLineDto {
  netPrice: string;
  /** `person` | `parcel` — decides the row's label BEFORE `fareCategory` (BR-8). */
  occupantType: string;
  fareCategory: string;
  ticketCount: number;
  amount: string;
}

/** One payment-method bucket of the seller's own tickets. */
export interface StaffRemittanceMethodLineDto {
  method: string;
  ticketCount: number;
  amount: string;
}

/** The seller's own tickets on this round. `ticketCount == passengerCount` always (BR-9). */
export interface StaffRemittanceTicketsDto {
  ticketCount: number;
  totalAmount: string;
  cashAmount: string;
  byFare: StaffRemittanceFareLineDto[];
  byMethod: StaffRemittanceMethodLineDto[];
}

/** One outbound-round return ticket the seller sold. */
export interface StaffRemittanceReturnLegLineDto {
  scheduleId: number;
  departureDateTime: string;
  ticketCount: number;
  amount: string;
}

/**
 * OBRS-1755 ⑥ — return-leg cash the seller took at this counter.
 *
 * Owner ruling 2026-09-13 (spec §5, option ①): this IS a positive term of
 * `myExpectedCash` (BR-4/BR-25), because หนองชาก hands return-ticket cash over
 * with the round's takings rather than holding it to close of day. The screen
 * therefore draws it as an equation row with a `+`, not as a grey info line.
 *
 * The same commit removes this money from the seller's close-of-day pile
 * (BR-26) — if only one of the two sides moved it would be demanded twice.
 * Nothing about that is the client's to decide: `myExpectedCash` already has it
 * folded in, and this field exists so the screen can SHOW the term.
 */
export interface StaffRemittanceReturnLegDto {
  cashAmount: string;
  lines: StaffRemittanceReturnLegLineDto[];
}

/**
 * The driver cash-advance box. `allowed` is false wherever the round cannot
 * take one — `blockedReason` says which case (e.g. `NO_VEHICLE`).
 *
 * `recordedAmount` is the SAME number as `deductions.advancePaidOut` (BR-13);
 * the screen renders one of them in both places rather than trusting them to
 * agree.
 */
export interface StaffRemittanceAdvanceDto {
  allowed: boolean;
  recordedCount: number;
  recordedAmount: string;
  blockedReason: string | null;
}

/**
 * One stop at which this counter keeps a per-head fee. An ARRAY because a sales
 * point can cover several stops (BR-11) — never tie-broken down to one.
 *
 * `systemHeadCount` is what the system counted and is shown ALWAYS, beside any
 * number the clerk typed over it (owner ruling 2026-09-09).
 */
export interface StaffRemittancePerHeadLineDto {
  stopId: number;
  stopName: string;
  salesPointId: number;
  ratePerHead: string;
  configured: boolean;
  systemHeadCount: number;
  recordedHeadCount: number;
  recordedAmount: string;
}

/** The negative terms of BR-4, all positive magnitudes. These are ROUND-wide, not per-seller (BR-3). */
export interface StaffRemittanceDeductionsDto {
  perHeadDeducted: string;
  advancePaidOut: string;
  /** Always present, even at 0 — but deliberately NOT drawn as a row (BR-7). */
  deferredTicketCash: string;
}

/** The live submission, or `null` when nothing has been sent for this round yet. */
export interface StaffRemittanceSubmissionDto {
  submittedAt: string;
  submittedExpectedCash: string;
  /** True when the round's live figure has moved since it was submitted (BR-17). */
  stale: boolean;
}

/** `GET /settlements/schedules/{id}/my-remittance` and the `submit` 200 — the same shape. */
export interface StaffRemittanceDto {
  scheduleId: number;
  originStopId: number;
  originStopSlug: string;
  departureDateTime: string;
  routeSlug: string;
  currency: string;
  departed: boolean;
  status: StaffRemittanceStatus;
  remitCadence: StaffRemitCadence;
  sellerUserId: number;
  sellerName: string;
  /** > 1 means the deduction rows below belong to the WHOLE round, not to this seller (BR-3). */
  roundSellerCount: number;
  myTickets: StaffRemittanceTicketsDto;
  returnLeg: StaffRemittanceReturnLegDto;
  advance: StaffRemittanceAdvanceDto;
  perHeadLines: StaffRemittancePerHeadLineDto[];
  hasPerHead: boolean;

  /**
   * OBRS-1755 F1 — the ค่าหัว on this round that `perHeadLines` does NOT show:
   * another counter's stop, or a row with no stop at all.
   *
   * <p>ONE OPAQUE NUMBER, never a breakdown — a salesperson may not see another
   * counter's takings. The invariant the client may rely on is:
   *
   * <pre>perHeadDeducted === Σ perHeadLines[].recordedAmount + perHeadOtherCountersAmount</pre>
   *
   * <p><b>Why it exists.</b> `deductions.perHeadDeducted` is the WHOLE ROUND's
   * (BR-3) while `perHeadLines` is caller-scoped, so a screen that rebuilt the
   * figure from its own lines alone landed exactly this amount short of the
   * server — and every submit came back `SETTLEMENT_SUBMIT_AMOUNT_STALE`
   * quoting a number the counter had no way to compute, with resubmitting
   * unable to close the gap (QA F1, 2026-09-13: screen 638.00, server 626.00).
   *
   * <p>⛔ The remedy is to SUBTRACT this alongside the visible lines — never to
   * narrow `perHeadDeducted` to the caller, which BR-3 forbids and which would
   * stop the round's own expectation reconciling for the owner.
   */
  perHeadOtherCountersAmount: string;

  deductions: StaffRemittanceDeductionsDto;
  /** SIGNED (BR-4). Negative = the owner owes the salesperson. ⛔ never clamped, never recomputed here. */
  myExpectedCash: string;
  /** The whole round's expectation, server-computed (BR-5). ⛔ never recomputed here. */
  roundExpectedCash: string;
  submission: StaffRemittanceSubmissionDto | null;
}

/** One stop's head count for this round — a TOTAL, not a delta (BR-12). */
export interface StaffRemittancePerHeadReqDto {
  stopId: number;
  headCount: number;
}

/**
 * `POST /settlements/schedules/{id}/submit`.
 *
 * `advanceAmount` is the NEW money handed over in this submit (null/0 writes no
 * row) — not a running total. `expectedCashAmount` is the figure the clerk had
 * on screen; the server only uses it to refuse a stale submit and never stores
 * it.
 */
export interface StaffRemittanceSubmitReqDto {
  advanceAmount: string | null;
  perHead: StaffRemittancePerHeadReqDto[];
  expectedCashAmount: string;
}
